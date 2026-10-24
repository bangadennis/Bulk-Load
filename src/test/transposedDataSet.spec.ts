import { vi } from "vitest";
import { getCompositionRoot } from "../CompositionRoot";
import { DataSetGenerated04 } from "../data/templates";
import { ExcelPopulateRepository } from "../data/ExcelPopulateRepository";
import { DataForm } from "../domain/entities/DataForm";
import { ExcelBuilder } from "../domain/helpers/ExcelBuilder";
import { ExcelReader } from "../domain/helpers/ExcelReader";
import { DataElementDisaggregationsMappingRepository } from "../domain/repositories/DataElementDisaggregationsMappingRepository";
import { InstanceRepository } from "../domain/repositories/InstanceRepository";
import { ModulesRepositories } from "../domain/repositories/ModulesRepositories";
import { ColumnDataSource, setDataEntrySheet, TemplateDataPackage } from "../domain/entities/Template";
import { Workbook } from "../webapp/logic/Workbook";
import Settings from "../webapp/logic/settings";
import { SheetBuilder, SheetBuilderParams } from "../webapp/logic/sheetBuilder";
import { initializeMockServer } from "./mocks/server";

const { api } = initializeMockServer();
const compositionRoot = getCompositionRoot({
    appConfig: { appKey: "bulk-load", storage: "dataStore" },
    dhisInstance: { type: "local", url: api.baseUrl },
    mockApi: api,
});

const sheet = "Data Entry";
const template = new DataSetGenerated04();

const defaultCombo = {
    id: "COCDEFAULT",
    type: "categoryOptionCombos",
    code: "default",
    name: "default",
    categoryCombo: { id: "CCDEFAULT" },
    categoryOptions: [],
};

const dataElement1 = {
    id: "DE1",
    type: "dataElements",
    name: "Data element 1",
    valueType: "TEXT",
    categoryCombo: { id: "CCDEFAULT" },
};

const dataElement2 = {
    id: "DE2",
    type: "dataElements",
    name: "Data element 2",
    valueType: "INTEGER",
    categoryCombo: { id: "CCDEFAULT" },
};

function buildParams(settings: Settings): SheetBuilderParams {
    const elementMetadata = new Map<string, unknown>([
        ["CCDEFAULT", { id: "CCDEFAULT", type: "categoryCombos", code: "default", categories: [] }],
        [defaultCombo.id, defaultCombo],
        [dataElement1.id, dataElement1],
        [dataElement2.id, dataElement2],
        ["ds1", { id: "ds1", type: "dataSets", displayName: "Test DataSet" }],
    ]);

    return {
        element: {
            id: "ds1",
            type: "dataSets",
            displayName: "Test DataSet",
            formType: "DEFAULT",
            periodType: "Monthly",
            categoryCombo: { id: "CCDEFAULT" },
            dataSetElements: [{ dataElement: { id: dataElement1.id } }, { dataElement: { id: dataElement2.id } }],
            sections: [],
            attributeValues: [],
        },
        metadata: {},
        elementMetadata,
        organisationUnits: [{ id: "OU1", displayName: "Org unit 1", translations: [] }],
        rawMetadata: {
            dataElements: [dataElement1, dataElement2],
            categoryOptionCombos: [defaultCombo],
            optionSets: [],
            programStageDataElements: [],
            programTrackedEntityAttributes: [],
        },
        language: "en",
        template,
        settings,
        downloadRelationships: false,
        splitDataEntryTabsBySection: false,
        useCodesForMetadata: false,
        orgUnitShortName: false,
    };
}

const dataForm = { id: "ds1", type: "dataSets", name: "Test DataSet" } as unknown as DataForm;

function buildReader(excelRepository: ExcelPopulateRepository) {
    return new ExcelReader(
        excelRepository,
        {} as InstanceRepository,
        {} as DataElementDisaggregationsMappingRepository
    );
}

describe("Transposed data set template (data elements as rows)", () => {
    let settings: Settings;

    beforeAll(async () => {
        settings = await Settings.build(api, compositionRoot);
    });

    function load(excelRepository: ExcelPopulateRepository, workbook: Workbook) {
        // Parsing files is not supported by the test environment (no browser Blob), so register the
        // generated workbook directly in the repository.
        const registry = excelRepository as unknown as { workbooks: Record<string, unknown> };
        registry.workbooks[template.id] = workbook.xworkbook;
        return template.id;
    }

    async function generate() {
        const workbook = await new SheetBuilder(buildParams(settings)).generate();
        const excelRepository = new ExcelPopulateRepository();
        const id = load(excelRepository, workbook);
        return { excelRepository, id, workbook };
    }

    it("generates data elements as rows and stamps the template version", async () => {
        const { excelRepository, id, workbook } = await generate();

        expect(id).toEqual(template.id);
        expect(workbook.xworkbook.definedName().filter(name => name.startsWith("Version_"))).toEqual([
            `Version_${template.id}`,
        ]);

        const cell = (ref: string) => workbook.xworkbook.sheet(sheet).cell(ref);
        expect(cell("A4").formula()).toEqual("_ds1");
        expect(cell("A10").formula()).toEqual("_DE1");
        expect(cell("B10").formula()).toEqual("_COCDEFAULT");
        expect(cell("A11").formula()).toEqual("_DE2");
        expect(cell("C5").value()).toBeUndefined();
        expect(cell("A12").value()).toBeUndefined();
        expect(await excelRepository.getSheets(id)).toBeDefined();
    });

    it("reads one data entry per value column", async () => {
        const { excelRepository, id, workbook } = await generate();
        const cell = (ref: string) => workbook.xworkbook.sheet(sheet).cell(ref);

        cell("C5").value("OU1");
        cell("C6").value("202401");
        cell("C7").value("COCDEFAULT");
        cell("C8").value("true");
        cell("C10").value("text value");
        cell("C11").value(10);

        cell("D5").value("OU1");
        cell("D6").value("202402");
        cell("D11").value(20);

        // Value without period -> ignored
        cell("E5").value("OU1");
        cell("E10").value("ignored");

        const id2 = load(excelRepository, workbook);
        const dataPackage = await buildReader(excelRepository).readTemplate(template, dataForm);

        expect(id2).toEqual(id);
        expect(dataPackage?.type).toEqual("dataSets");

        const entries = dataPackage?.dataEntries ?? [];
        expect(entries).toHaveLength(2);

        const [first, second] = entries;
        expect(first).toMatchObject({
            dataForm: "ds1",
            orgUnit: "OU1",
            period: "202401",
            attribute: "COCDEFAULT",
            completed: true,
            group: "C",
        });
        expect(first?.dataValues.map(dv => [dv.dataElement, dv.category, dv.value, dv.column, dv.row])).toEqual([
            ["DE1", "COCDEFAULT", "text value", "C", 10],
            ["DE2", "COCDEFAULT", "10", "C", 11],
        ]);

        expect(second).toMatchObject({ orgUnit: "OU1", period: "202402", group: "D" });
        expect(second?.dataValues.map(dv => [dv.dataElement, dv.value])).toEqual([["DE2", "20"]]);
    });

    it("populates the data entries in value columns", async () => {
        const { excelRepository, id, workbook } = await generate();

        const builder = new ExcelBuilder(
            excelRepository,
            {} as InstanceRepository,
            {} as ModulesRepositories,
            {} as DataElementDisaggregationsMappingRepository
        );

        const dataPackage = {
            type: "dataSets",
            dataEntries: [
                {
                    group: undefined,
                    dataForm: "ds1",
                    id: undefined,
                    orgUnit: "OU1",
                    period: "202401",
                    attribute: "COCDEFAULT",
                    completed: true,
                    coordinate: undefined,
                    trackedEntityInstance: undefined,
                    programStage: undefined,
                    geometry: undefined,
                    dataValues: [
                        { dataElement: "DE1", category: "COCDEFAULT", value: "hello" },
                        { dataElement: "DE2", category: "COCDEFAULT", value: "5" },
                    ],
                },
                {
                    group: undefined,
                    dataForm: "ds1",
                    id: undefined,
                    orgUnit: "OU1",
                    period: "202402",
                    attribute: undefined,
                    completed: undefined,
                    coordinate: undefined,
                    trackedEntityInstance: undefined,
                    programStage: undefined,
                    geometry: undefined,
                    dataValues: [{ dataElement: "DE2", category: "COCDEFAULT", value: "7" }],
                },
            ],
        } as unknown as TemplateDataPackage;

        // Populate works on the loaded workbook (the same one used by the reader)
        vi.spyOn(console, "error").mockImplementation(() => {});
        await builder.populateTemplate(template, dataPackage as never, settings, dataForm);

        const read = (ref: string) => excelRepository.readCell(id, { type: "cell", sheet, ref });
        // Known ids are written as defined-name formulas, as in the row layout
        expect(await read("C5")).toEqual("_OU1");
        expect(await read("C6")).toEqual(202401);
        expect(await read("C7")).toEqual("_COCDEFAULT");
        expect(await read("C8")).toEqual("_true");
        expect(await read("C10")).toEqual("hello");
        expect(await read("C11")).toEqual(5);
        expect(await read("D6")).toEqual(202402);
        expect(await read("D10")).toBeUndefined();
        expect(await read("D11")).toEqual(7);
        expect(workbook).toBeDefined();
    });

    it("expands the column data source to every section tab", () => {
        const [dataSource] = template.dataSources as ColumnDataSource[];
        if (!dataSource) throw new Error("Missing data source");

        const sheets = [
            { index: 0, name: "Data Entry - Basic", active: true },
            { index: 1, name: "Data Entry - Extra", active: false },
            { index: 2, name: "Legend", active: false },
        ];

        const dataSources = setDataEntrySheet(dataSource, sheets);

        expect(dataSources.map(ds => ds.type)).toEqual(["column", "column"]);
        expect(dataSources.map(ds => ds.range.sheet)).toEqual(["Data Entry - Basic", "Data Entry - Extra"]);
        expect(dataSources.map(ds => ds.orgUnit.sheet)).toEqual(["Data Entry - Basic", "Data Entry - Extra"]);
        expect(dataSources[1]).toMatchObject({
            orgUnit: { type: "row", ref: 5 },
            dataElement: { type: "column", ref: "A" },
            completed: { type: "row", ref: 8 },
        });
    });
});
