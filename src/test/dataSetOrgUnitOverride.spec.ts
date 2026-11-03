import { getCompositionRoot } from "../CompositionRoot";
import { DataSetGenerated03, DataSetGenerated04 } from "../data/templates";
import { DataPackage } from "../domain/entities/DataPackage";
import { Template } from "../domain/entities/Template";
import { ImportTemplateUseCase } from "../domain/usecases/ImportTemplateUseCase";
import Settings from "../webapp/logic/settings";
import { SheetBuilder } from "../webapp/logic/sheetBuilder";
import {
    buildBuilder,
    buildDataSetParams,
    buildReader,
    dataForm,
    registerWorkbook,
    value,
} from "./fixtures/dataSetLayouts";
import { initializeMockServer } from "./mocks/server";

/*
    Import of a data set whose template has no org unit, in the row layout (v3) and the transposed
    layout (v4): with "override" the selected org unit is used, without it the entries are invalid.
*/

const { api } = initializeMockServer();
const compositionRoot = getCompositionRoot({
    appConfig: { appKey: "bulk-load", storage: "dataStore" },
    dhisInstance: { type: "local", url: api.baseUrl },
    mockApi: api,
});

const noOrgUnitPackage = {
    type: "dataSets",
    dataEntries: [
        {
            dataForm: "ds1",
            orgUnit: "",
            period: "202401",
            attribute: "COCDEFAULT",
            completed: false,
            dataValues: [value("DEA", "COCDEFAULT", "hello"), value("DEB", "COCFEMALE", "10")],
        },
    ],
} as unknown as DataPackage;

async function runImport(settings: Settings, template: Template, params: { override: boolean }) {
    const workbook = await new SheetBuilder(buildDataSetParams(settings, template)).generate();
    const excelRepository = registerWorkbook(template, workbook);
    await buildBuilder(excelRepository).populateTemplate(template, noOrgUnitPackage, settings, dataForm);
    const templateData = await buildReader(excelRepository).readTemplate(template, dataForm);

    const imported: DataPackage[] = [];
    const instanceRepository = {
        getDataFormOrgUnits: async () => [{ id: "OU1", name: "Org unit OU1", level: 1, path: "/OU1" }],
        getDefaultIds: async () => ["COCDEFAULT"],
        getDataPackage: async () => ({ type: "dataSets", dataEntries: [] }),
        importDataPackage: async (dataPackage: DataPackage) => {
            imported.push(dataPackage);
            return [
                {
                    title: "Import",
                    status: "SUCCESS",
                    stats: { created: 0, deleted: 0, ignored: 0, updated: 0, total: 0 },
                    rawResponse: {},
                },
            ];
        },
    };

    const useCase = new ImportTemplateUseCase(
        instanceRepository as never,
        { getTemplate: async () => template } as never,
        { loadTemplate: async () => template.id } as never,
        { uploadAll: async () => [] } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never
    );
    // The reader runs on the generated workbook; the rest of the import runs for real
    (useCase as unknown as { readTemplate: unknown }).readTemplate = async () => templateData;

    const run = (useCase as unknown as { run: (...args: unknown[]) => Promise<{ result: any }> }).run.bind(useCase);
    const { result } = await run(
        {
            useBuilderOrgUnits: params.override,
            selectedOrgUnits: params.override ? ["/OU1"] : [],
            duplicateStrategy: "IMPORT_WITHOUT_DELETE",
            organisationUnitStrategy: "ERROR",
            settings: {
                ...settings,
                duplicateEnabled: false,
                currentUser: { orgUnits: [{ level: 1 }], orgUnitsView: [{ level: 1 }] },
            },
        },
        dataForm,
        new Blob([]),
        []
    );

    return { result, imported };
}

describe("Data set import without org unit in the template", () => {
    let settings: Settings;

    beforeAll(async () => {
        settings = await Settings.build(api, compositionRoot);
    });

    for (const [name, template] of [
        ["data elements as columns (v3)", new DataSetGenerated03()],
        ["data elements as rows (v4)", new DataSetGenerated04()],
    ] as const) {
        it(`${name}: uses the selected org unit when override is on`, async () => {
            const { result, imported } = await runImport(settings, template, { override: true });

            expect(result.isSuccess?.() ?? result.type === "success").toBeTruthy();
            expect(imported).toHaveLength(1);
            const entries = imported[0]?.dataEntries ?? [];
            expect(entries.length).toBeGreaterThan(0);
            expect(entries.every(entry => entry.orgUnit === "OU1")).toBe(true);
            expect(entries.flatMap(entry => entry.dataValues)).toHaveLength(2);
        });

        it(`${name}: reports the entries as invalid org units when override is off`, async () => {
            const { result, imported } = await runImport(settings, template, { override: false });

            expect(imported).toHaveLength(0);
            expect(JSON.stringify(result)).toContain("INVALID_ORG_UNITS");
        });
    }
});
