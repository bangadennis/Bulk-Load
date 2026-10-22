import _ from "lodash";
import { getCompositionRoot } from "../CompositionRoot";
import { DataSetGenerated04 } from "../data/templates";
import { DataPackage } from "../domain/entities/DataPackage";
import Settings from "../webapp/logic/settings";
import { SheetBuilder } from "../webapp/logic/sheetBuilder";
import { Workbook } from "../webapp/logic/Workbook";
import { buildDataSetParams, populateAndReadWorkbook, value } from "./fixtures/dataSetLayouts";
import { initializeMockServer } from "./mocks/server";

/*
    The transposed layout has 100 entry columns (starting at C). The dropdowns of the header rows
    cover the whole row, and values are written and imported in any column, so more entries can be added.
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

describe("Transposed data set: entry columns", () => {
    let settings: Settings;

    beforeAll(async () => {
        settings = await Settings.build(api, compositionRoot);
    });

    // Number of entry columns: columns (from C) with a width, set for every entry column
    function countEntryColumns(workbook: Workbook): number {
        const sheet = workbook.xworkbook.sheet(sheetName);
        let count = 0;
        for (let column = firstEntryColumn; column < firstEntryColumn + 1500; column++) {
            if (!sheet.column(column).width()) break;
            count++;
        }
        return count;
    }

    it("has 100 entry columns", async () => {
        const workbook = await new SheetBuilder(buildDataSetParams(settings, template)).generate();

        expect(countEntryColumns(workbook)).toEqual(100);
    });

    it("validates the header rows and the value rows of the whole row (no limit of entries)", async () => {
        const workbook = await new SheetBuilder(buildDataSetParams(settings, template)).generate();
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

    it("populates and imports data entries beyond the styled columns", async () => {
        const entries = _.range(0, 150).map(index => ({
            dataForm: "ds1",
            orgUnit: `OU${(index % 3) + 1}`,
            period: `2024${String((index % 12) + 1).padStart(2, "0")}`,
            attribute: `ATTR${index}`,
            completed: false,
            dataValues: [value("DEA", "COCDEFAULT", `text ${index}`), value("DEB", "COCMALE", String(index))],
        }));
        const dataPackage = { type: "dataSets", dataEntries: entries } as unknown as DataPackage;

        const workbook = await new SheetBuilder(buildDataSetParams(settings, template)).generate();
        const { result } = await populateAndReadWorkbook(template, workbook, settings, dataPackage);

        expect(result?.dataEntries).toHaveLength(150);
        expect(result?.dataEntries.map(entry => entry.attribute)).toEqual(entries.map(entry => entry.attribute));
        expect(result?.dataEntries[149]?.dataValues.map(dv => dv.value)).toEqual(["text 149", "149"]);
    });
});
