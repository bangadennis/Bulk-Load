import _ from "lodash";
import { getCompositionRoot } from "../CompositionRoot";
import { DataSetGenerated03, DataSetGenerated04 } from "../data/templates";
import { CustomTemplate, DataSource } from "../domain/entities/Template";
import Settings from "../webapp/logic/settings";
import { Workbook } from "../webapp/logic/Workbook";
import { normalize, populateAndRead, populateAndReadWorkbook } from "./fixtures/dataSetLayouts";
import { initializeMockServer } from "./mocks/server";

/*
    Import does not depend on the template: the same data populated into the row layout (v3), the
    generated transposed layout (v4) and a hand-made custom transposed template reads back identically.
*/

const { api } = initializeMockServer();
const compositionRoot = getCompositionRoot({
    appConfig: { appKey: "bulk-load", storage: "dataStore" },
    dhisInstance: { type: "local", url: api.baseUrl },
    mockApi: api,
});

const sheet = "Form";

// Rows in the custom template (data element, category option combo), in the order of the form
const formRows = [
    ["DED", "COCMALE"],
    ["DEA", "COCDEFAULT"],
    ["DEB", "COCFEMALE"],
    ["DEC", "COCDEFAULT"],
    ["DEB", "COCMALE"],
    ["DED", "COCFEMALE"],
] as const;

const firstDataRow = 8;

function buildDataSources(range: { rowEnd?: number } = {}): DataSource[] {
    return [
        {
            type: "column",
            orgUnit: { type: "row", sheet, ref: 3 },
            period: { type: "row", sheet, ref: 4 },
            attribute: { type: "row", sheet, ref: 5 },
            completed: { type: "row", sheet, ref: 6 },
            range: { sheet, rowStart: firstDataRow, columnStart: "D", ...range },
            dataElement: { type: "column", sheet, ref: "A" },
            categoryOption: { type: "column", sheet, ref: "B" },
        },
    ];
}

function buildCustomTemplate(dataSources: DataSource[]): CustomTemplate {
    return {
        type: "custom",
        id: "CUSTOM_TRANSPOSED",
        name: "Custom transposed",
        description: "",
        isDefault: false,
        mode: "basic",
        file: { name: "custom.xlsx", contents: "" },
        created: undefined,
        lastUpdated: undefined,
        dataFormId: { type: "value", id: "ds1" },
        dataFormType: { type: "value", id: "dataSets" },
        dataSources,
        styleSources: [],
    };
}

// Hand-made workbook: ids typed as plain text (no formulas, no Metadata sheet)
async function buildCustomWorkbook(): Promise<Workbook> {
    const workbook = await Workbook.empty();
    const xsheet = workbook.xworkbook.sheet(0).name(sheet);
    xsheet.cell("A3").value("Org unit");
    xsheet.cell("A4").value("Period");
    xsheet.cell("A5").value("Attribute");
    xsheet.cell("A6").value("Completed");

    formRows.forEach(([dataElement, combo], index) => {
        xsheet.cell(firstDataRow + index, 1).value(dataElement);
        xsheet.cell(firstDataRow + index, 2).value(combo);
    });

    return workbook;
}

describe("Import is independent of the template (row layout, generated and custom transposed)", () => {
    let settings: Settings;

    beforeAll(async () => {
        settings = await Settings.build(api, compositionRoot);
    });

    it("reads the same data entries from a custom transposed template", async () => {
        const reference = normalize((await populateAndRead(new DataSetGenerated03(), settings)).result);
        expect(reference).toHaveLength(6);

        const template = buildCustomTemplate(buildDataSources());
        const custom = await populateAndReadWorkbook(template, await buildCustomWorkbook(), settings);

        expect(normalize(custom.result)).toEqual(reference);
    });

    it("populates the plain-text rows of a custom template (last row found without formulas)", async () => {
        const template = buildCustomTemplate(buildDataSources());
        const { workbook } = await populateAndReadWorkbook(template, await buildCustomWorkbook(), settings);

        const cell = (ref: string) => workbook.xworkbook.sheet(sheet).cell(ref).value();
        // First data entry (OU1, 202401) is in column D
        expect(cell("D3")).toEqual("OU1");
        expect(cell("D4")).toEqual(202401);
        expect(cell("D5")).toEqual("COCDEFAULT");
        expect(cell("D6")).toEqual("true");
        // Rows are in the order of the form: DED/male has no value for OU1
        expect(cell("D8")).toBeUndefined();
        expect(cell("D9")).toEqual("text OU1 202401");
        expect(cell("D10")).toEqual(10);
        expect(cell("D12")).toEqual(20);
        // 6th data entry (OU3, 202402) is in column I
        expect(cell("I3")).toEqual("OU3");
    });

    it("uses the explicit last row of the template when it is defined", async () => {
        // Only the first three form rows are part of the range
        const template = buildCustomTemplate(buildDataSources({ rowEnd: firstDataRow + 2 }));
        const { workbook } = await populateAndReadWorkbook(template, await buildCustomWorkbook(), settings);

        const cell = (ref: string) => workbook.xworkbook.sheet(sheet).cell(ref).value();
        expect(cell("D9")).toEqual("text OU1 202401");
        expect(cell("D10")).toEqual(10);
        expect(cell("D12")).toBeUndefined(); // DEB male, outside the range
    });

    it("matches the generated transposed template", async () => {
        const reference = normalize((await populateAndRead(new DataSetGenerated04(), settings)).result);
        const template = buildCustomTemplate(buildDataSources());
        const custom = await populateAndReadWorkbook(template, await buildCustomWorkbook(), settings);

        expect(normalize(custom.result)).toEqual(reference);
        expect(_.uniq(reference.map(entry => entry.orgUnit))).toEqual(["OU1", "OU2", "OU3"]);
    });
});
