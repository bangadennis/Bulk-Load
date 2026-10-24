import _ from "lodash";
import { getCompositionRoot } from "../CompositionRoot";
import { DataSetGenerated03, DataSetGenerated04 } from "../data/templates";
import { DataPackage } from "../domain/entities/DataPackage";
import Settings from "../webapp/logic/settings";
import { SheetBuilder } from "../webapp/logic/sheetBuilder";
import {
    buildBuilder,
    buildDataSetParams,
    buildReader,
    dataForm,
    normalize,
    populateAndRead,
    registerWorkbook,
    value,
} from "./fixtures/dataSetLayouts";
import { initializeMockServer } from "./mocks/server";

/*
    Generates the same data set with the row layout (v3) and the transposed layout (v4), populates
    both with the same data, and checks that importing them gives the same data entries.
*/

const { api } = initializeMockServer();
const compositionRoot = getCompositionRoot({
    appConfig: { appKey: "bulk-load", storage: "dataStore" },
    dhisInstance: { type: "local", url: api.baseUrl },
    mockApi: api,
});

const row = new DataSetGenerated03();
const transposed = new DataSetGenerated04();
const sheet = "Data Entry";

describe("Transposed data set template parity with the row layout", () => {
    let settings: Settings;

    beforeAll(async () => {
        settings = await Settings.build(api, compositionRoot);
    });

    it("lists the same data element / category option combo pairs in the same order", async () => {
        const rowWorkbook = await new SheetBuilder(buildDataSetParams(settings, row)).generate();
        const transposedWorkbook = await new SheetBuilder(buildDataSetParams(settings, transposed)).generate();

        // Row layout: data elements in row 4 (merged over their combos), combos in row 5, from column E
        const rowSheet = rowWorkbook.xworkbook.sheet(sheet);
        let currentDataElement: string | undefined;
        const rowPairs: string[] = [];
        for (let column = 5; ; column++) {
            const combo = rowSheet.cell(5, column).formula();
            if (!combo) break;
            const dataElement = rowSheet.cell(4, column).formula();
            // Merged cells repeat the formula as "SHARED" after the first column
            if (dataElement && dataElement !== "SHARED") currentDataElement = String(dataElement);
            rowPairs.push(`${currentDataElement}|${combo}`);
        }

        // Transposed layout: data element in column A and combo in column B, from row 10
        const transposedSheet = transposedWorkbook.xworkbook.sheet(sheet);
        const transposedPairs: string[] = [];
        for (let rowIndex = 10; ; rowIndex++) {
            const dataElement = transposedSheet.cell(rowIndex, 1).formula();
            if (!dataElement) break;
            transposedPairs.push(`${dataElement}|${transposedSheet.cell(rowIndex, 2).formula()}`);
        }

        expect(rowPairs).toEqual([
            "_DEA|_COCDEFAULT",
            "_DEC|_COCDEFAULT",
            "_DEB|_COCFEMALE",
            "_DEB|_COCMALE",
            "_DED|_COCFEMALE",
            "_DED|_COCMALE",
        ]);
        expect(transposedPairs).toEqual(rowPairs);
    });

    it("populates and imports the same data entries in both layouts", async () => {
        const rowRun = await populateAndRead(row, settings);
        const transposedRun = await populateAndRead(transposed, settings);

        const rowEntries = normalize(rowRun.result);
        const transposedEntries = normalize(transposedRun.result);

        expect(rowEntries).toHaveLength(6);
        expect(rowEntries[0]).toEqual({
            dataForm: "ds1",
            orgUnit: "OU1",
            period: "202401",
            attribute: "COCDEFAULT",
            completed: true,
            values: ["DEA|COCDEFAULT=text OU1 202401", "DEB|COCFEMALE=10", "DEB|COCMALE=20"],
        });
        expect(transposedEntries).toEqual(rowEntries);
    });

    it("keeps the data entries of all columns when the entries exceed the validated columns", async () => {
        const manyEntries = {
            type: "dataSets",
            dataEntries: _.range(0, 60).map(index => ({
                dataForm: "ds1",
                orgUnit: "OU1",
                period: `2024${String((index % 12) + 1).padStart(2, "0")}`,
                attribute: `ATTR${index}`,
                completed: false,
                dataValues: [value("DEA", "COCDEFAULT", `text ${index}`)],
            })),
        } as unknown as DataPackage;

        const workbook = await new SheetBuilder(buildDataSetParams(settings, transposed)).generate();
        const excelRepository = registerWorkbook(transposed, workbook);
        await buildBuilder(excelRepository).populateTemplate(transposed, manyEntries, settings, dataForm);
        const result = await buildReader(excelRepository).readTemplate(transposed, dataForm);

        expect(result?.dataEntries).toHaveLength(60);
        expect(result?.dataEntries.map(entry => entry.dataValues[0]?.value)).toEqual(
            _.range(0, 60).map(index => `text ${index}`)
        );
    });
});
