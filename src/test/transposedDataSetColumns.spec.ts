import _ from "lodash";
import moment from "moment";
import { getCompositionRoot } from "../CompositionRoot";
import { DataSetGenerated04 } from "../data/templates";
import { DataPackage } from "../domain/entities/DataPackage";
import Settings from "../webapp/logic/settings";
import { SheetBuilder } from "../webapp/logic/sheetBuilder";
import { Workbook } from "../webapp/logic/Workbook";
import { buildDataSetParams, DataSetParamsOptions, populateAndReadWorkbook, value } from "./fixtures/dataSetLayouts";
import { initializeMockServer } from "./mocks/server";

/*
    The number of entry columns of the transposed layout is dynamic. Entry columns start at C (index 3):
    - at least 50
    - org units x periods of the selection, up to 500
    - at least the data entries to populate (no limit but Excel's)
    The dropdown validations of the header rows cover the whole row.
*/

const { api } = initializeMockServer();
const compositionRoot = getCompositionRoot({
    appConfig: { appKey: "bulk-load", storage: "dataStore" },
    dhisInstance: { type: "local", url: api.baseUrl },
    mockApi: api,
});

const template = new DataSetGenerated04();
const sheetName = "Data Entry";
const firstEntryColumn = 3;

describe("Transposed data set: dynamic number of entry columns", () => {
    let settings: Settings;

    beforeAll(async () => {
        settings = await Settings.build(api, compositionRoot);
    });

    async function generate(options?: DataSetParamsOptions) {
        const workbook = await new SheetBuilder(buildDataSetParams(settings, template, options)).generate();
        return workbook;
    }

    // Number of styled entry columns: columns of row 10 (first data row) with a fill
    function countStyledEntryColumns(workbook: Workbook): number {
        const sheet = workbook.xworkbook.sheet(sheetName);
        let count = 0;
        for (let column = firstEntryColumn; column < firstEntryColumn + 1500; column++) {
            const fill = sheet.cell(10, column).style("fill");
            if (!fill) break;
            count++;
        }
        return count;
    }

    const year = { startDate: moment("2024-01-01"), endDate: moment("2024-12-31") };

    it("has 50 entry columns by default", async () => {
        expect(countStyledEntryColumns(await generate())).toEqual(50);
    });

    it("has one column per org unit and period of the selection when it is larger than the minimum", async () => {
        // 40 org units x 6 months
        const workbook = await generate({
            orgUnitsCount: 40,
            startDate: moment("2024-01-01"),
            endDate: moment("2024-06-30"),
        });

        expect(countStyledEntryColumns(workbook)).toEqual(240);
    });

    it("keeps the minimum for small selections", async () => {
        // 3 org units x 12 months = 36
        expect(countStyledEntryColumns(await generate({ ...year }))).toEqual(50);
    });

    it("limits the columns created from the selection to 500", async () => {
        // 400 org units x 12 months = 4800
        const workbook = await generate({ orgUnitsCount: 400, ...year });

        expect(countStyledEntryColumns(workbook)).toEqual(500);
    });

    it("has a column for every data entry to populate, even beyond the limit", async () => {
        expect(countStyledEntryColumns(await generate({ entryColumns: 120 }))).toEqual(120);
        expect(countStyledEntryColumns(await generate({ entryColumns: 620 }))).toEqual(620);
    });

    it("validates the header rows and the value rows of the whole row (no limit of entries)", async () => {
        const workbook = await generate();
        const sheet = workbook.xworkbook.sheet(sheetName);

        // Cell lookups do not match range validations, so check the stored ranges
        const validations = (sheet as unknown as { _dataValidations: Record<string, unknown> })._dataValidations;
        const ranges = Object.keys(validations);

        // Org unit, period, attribute option combo, completed
        expect(ranges).toEqual(expect.arrayContaining(["C5:XFD5", "C6:XFD6", "C7:XFD7", "C8:XFD8"]));
        // Boolean data element (row 11)
        expect(ranges).toContain("C11:XFD11");
        // Nothing is limited to the styled columns
        expect(ranges.every(range => range.endsWith(":XFD" + range.replace(/^[A-Z]+/, "").split(":")[0]))).toBe(true);
    });

    it("populates and imports 150 data entries", async () => {
        const entries = _.range(0, 150).map(index => ({
            dataForm: "ds1",
            orgUnit: `OU${(index % 3) + 1}`,
            period: `2024${String((index % 12) + 1).padStart(2, "0")}`,
            attribute: `ATTR${index}`,
            completed: false,
            dataValues: [value("DEA", "COCDEFAULT", `text ${index}`), value("DEB", "COCMALE", String(index))],
        }));
        const dataPackage = { type: "dataSets", dataEntries: entries } as unknown as DataPackage;

        const workbook = await generate({ entryColumns: entries.length });
        const { result } = await populateAndReadWorkbook(template, workbook, settings, dataPackage);

        expect(countStyledEntryColumns(workbook)).toEqual(150);
        expect(result?.dataEntries).toHaveLength(150);
        expect(result?.dataEntries.map(entry => entry.attribute)).toEqual(entries.map(entry => entry.attribute));
        expect(result?.dataEntries[149]?.dataValues.map(dv => dv.value)).toEqual(["text 149", "149"]);
    });
});
