import _ from "lodash";
import { ExcelPopulateRepository } from "../../data/ExcelPopulateRepository";
import { DataForm } from "../../domain/entities/DataForm";
import { DataPackage } from "../../domain/entities/DataPackage";
import { Template } from "../../domain/entities/Template";
import { ExcelBuilder } from "../../domain/helpers/ExcelBuilder";
import { ExcelReader } from "../../domain/helpers/ExcelReader";
import { DataElementDisaggregationsMappingRepository } from "../../domain/repositories/DataElementDisaggregationsMappingRepository";
import { InstanceRepository } from "../../domain/repositories/InstanceRepository";
import { ModulesRepositories } from "../../domain/repositories/ModulesRepositories";
import { Theme } from "../../domain/entities/Theme";
import Settings from "../../webapp/logic/settings";
import { SheetBuilder, SheetBuilderParams } from "../../webapp/logic/sheetBuilder";
import { Workbook } from "../../webapp/logic/Workbook";

/*
    Shared data set fixture for the layout tests: 4 data elements (default / "by sex" category combos),
    3 org units and 6 data entries.
*/

export const defaultCombo = {
    id: "COCDEFAULT",
    type: "categoryOptionCombos",
    code: "default",
    name: "default",
    categoryCombo: { id: "CCDEFAULT" },
    categoryOptions: [],
};

const femaleCombo = {
    id: "COCFEMALE",
    type: "categoryOptionCombos",
    name: "Female",
    categoryCombo: { id: "CCSEX" },
    categoryOptions: [{ id: "COFEMALE" }],
};

const maleCombo = {
    id: "COCMALE",
    type: "categoryOptionCombos",
    name: "Male",
    categoryCombo: { id: "CCSEX" },
    categoryOptions: [{ id: "COMALE" }],
};

export const dataElements = [
    { id: "DEA", type: "dataElements", name: "A text", valueType: "TEXT", categoryCombo: { id: "CCDEFAULT" } },
    { id: "DEB", type: "dataElements", name: "B number by sex", valueType: "INTEGER", categoryCombo: { id: "CCSEX" } },
    { id: "DEC", type: "dataElements", name: "C yes/no", valueType: "BOOLEAN", categoryCombo: { id: "CCDEFAULT" } },
    { id: "DED", type: "dataElements", name: "D number by sex", valueType: "INTEGER", categoryCombo: { id: "CCSEX" } },
];

export const orgUnits = ["OU1", "OU2", "OU3"].map(id => ({ id, displayName: `Org unit ${id}`, translations: [] }));

export type DataSetParamsOptions = {
    sections?: Array<{ id: string; sortOrder: number; dataElements: Array<{ id: string }> }>;
    theme?: Theme;
    splitDataEntryTabsBySection?: boolean;
};

export function buildDataSetParams(
    settings: Settings,
    template: Template,
    options: DataSetParamsOptions = {}
): SheetBuilderParams {
    const elementMetadata = new Map<string, unknown>([
        ["CCDEFAULT", { id: "CCDEFAULT", type: "categoryCombos", code: "default", categories: [] }],
        ["CCSEX", { id: "CCSEX", type: "categoryCombos", name: "Sex", categories: [{ id: "CATSEX" }] }],
        [
            "CATSEX",
            { id: "CATSEX", type: "categories", name: "Sex", categoryOptions: [{ id: "COFEMALE" }, { id: "COMALE" }] },
        ],
        ["COFEMALE", { id: "COFEMALE", type: "categoryOptions", name: "Female" }],
        ["COMALE", { id: "COMALE", type: "categoryOptions", name: "Male" }],
        [defaultCombo.id, defaultCombo],
        [femaleCombo.id, femaleCombo],
        [maleCombo.id, maleCombo],
        ["ds1", { id: "ds1", type: "dataSets", displayName: "Test DataSet" }],
        ...dataElements.map((de): [string, unknown] => [de.id, de]),
    ]);

    return {
        element: {
            id: "ds1",
            type: "dataSets",
            displayName: "Test DataSet",
            formType: "DEFAULT",
            periodType: "Monthly",
            categoryCombo: { id: "CCDEFAULT" },
            dataSetElements: dataElements.map(de => ({ dataElement: { id: de.id } })),
            sections: options.sections ?? [],
            attributeValues: [],
        },
        metadata: {},
        elementMetadata,
        organisationUnits: orgUnits,
        rawMetadata: {
            dataElements,
            categoryOptionCombos: [defaultCombo, femaleCombo, maleCombo],
            sections: options.sections ?? [],
            optionSets: [],
            programStageDataElements: [],
            programTrackedEntityAttributes: [],
        },
        language: "en",
        template,
        theme: options.theme,
        settings,
        downloadRelationships: false,
        splitDataEntryTabsBySection: options.splitDataEntryTabsBySection ?? false,
        useCodesForMetadata: false,
        orgUnitShortName: false,
    };
}

export const dataForm = { id: "ds1", type: "dataSets", name: "Test DataSet" } as unknown as DataForm;

export function value(dataElement: string, category: string, value: string) {
    return { dataElement, category, value };
}

// Entries are ordered by org unit and period (as the download does), values depend on the entry
export const dataPackage = {
    type: "dataSets",
    dataEntries: _.flatMap(["OU1", "OU2", "OU3"], orgUnit =>
        ["202401", "202402"].map((period, index) => ({
            dataForm: "ds1",
            orgUnit,
            period,
            attribute: "COCDEFAULT",
            completed: index === 0,
            dataValues: [
                value("DEA", "COCDEFAULT", `text ${orgUnit} ${period}`),
                value("DEB", "COCFEMALE", String(10 + index)),
                value("DEB", "COCMALE", String(20 + index)),
                // No value for DEC on purpose
                ...(orgUnit === "OU2" ? [value("DED", "COCMALE", "7")] : []),
            ],
        }))
    ),
} as unknown as DataPackage;

export function registerWorkbook(template: Template, workbook: Workbook) {
    const excelRepository = new ExcelPopulateRepository();
    const registry = excelRepository as unknown as { workbooks: Record<string, unknown> };
    registry.workbooks[template.id] = workbook.xworkbook;
    return excelRepository;
}

export function buildReader(excelRepository: ExcelPopulateRepository) {
    return new ExcelReader(
        excelRepository,
        {} as InstanceRepository,
        {} as DataElementDisaggregationsMappingRepository
    );
}

export function buildBuilder(excelRepository: ExcelPopulateRepository) {
    return new ExcelBuilder(
        excelRepository,
        {} as InstanceRepository,
        {} as ModulesRepositories,
        {} as DataElementDisaggregationsMappingRepository
    );
}

// Populates the workbook with the data package and reads it back with the import reader
export async function populateAndReadWorkbook(
    template: Template,
    workbook: Workbook,
    settings: Settings,
    pkg: DataPackage = dataPackage
) {
    const excelRepository = registerWorkbook(template, workbook);
    await buildBuilder(excelRepository).populateTemplate(template, pkg, settings, dataForm);
    const result = await buildReader(excelRepository).readTemplate(template, dataForm);
    return { workbook, excelRepository, result };
}

export async function populateAndRead(template: Template, settings: Settings, options?: DataSetParamsOptions) {
    const workbook = await new SheetBuilder(buildDataSetParams(settings, template, options)).generate();
    return populateAndReadWorkbook(template, workbook, settings);
}

// Comparable representation: independent of the layout (positions are layout specific)
export function normalize(result: Awaited<ReturnType<typeof populateAndReadWorkbook>>["result"]) {
    return _(result?.dataEntries)
        .map(entry => ({
            dataForm: entry.dataForm,
            orgUnit: entry.orgUnit,
            period: entry.period,
            attribute: entry.attribute,
            completed: entry.completed,
            values: _(entry.dataValues)
                .map(dv => `${dv.dataElement}|${dv.category}=${dv.value}`)
                .sortBy()
                .value(),
        }))
        .sortBy(entry => `${entry.orgUnit}|${entry.period}`)
        .value();
}
