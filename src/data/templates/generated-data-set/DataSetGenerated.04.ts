import { DataSource, GeneratedTemplate, StyleSource } from "../../../domain/entities/Template";

/*
    Transposed version of the auto-generated dataSet template: data elements (and category option
    combos) are rows, and each value column is a data entry (org unit + period + attribute).

    Data Entry sheet layout:
        A4          -> dataSet (title)
        row 5       -> org unit (one per value column, from column C)
        row 6       -> period
        row 7       -> attribute option combo
        row 8       -> completed
        row 9       -> column titles
        row 10 ...  -> column A: data element, column B: category option combo, column C...: values
*/
export class DataSetGenerated04 implements GeneratedTemplate {
    public readonly type = "generated";
    public readonly id = "DATASET_GENERATED_v4";
    public readonly name = "Auto-generated dataSet template (data elements as rows)";
    public readonly dataFormId = { type: "cell" as const, sheet: 0, ref: "A4" };
    public readonly dataFormType = { type: "value" as const, id: "dataSets" as const };

    public readonly rowOffset = 3;
    public readonly colOffset = 0;

    public readonly dataSources: DataSource[] = [
        {
            type: "column",
            orgUnit: {
                sheet: "Data Entry",
                type: "row",
                ref: 5,
            },
            period: {
                sheet: "Data Entry",
                type: "row",
                ref: 6,
            },
            attribute: {
                sheet: "Data Entry",
                type: "row",
                ref: 7,
            },
            completed: {
                sheet: "Data Entry",
                type: "row",
                ref: 8,
            },
            range: {
                sheet: "Data Entry",
                rowStart: 10,
                columnStart: "C",
            },
            dataElement: {
                sheet: "Data Entry",
                type: "column",
                ref: "A",
            },
            categoryOption: {
                sheet: "Data Entry",
                type: "column",
                ref: "B",
            },
        },
    ];

    public readonly styleSources: StyleSource[] = [
        {
            section: "title",
            source: {
                type: "range",
                ref: "D2:I2",
                sheet: "Data Entry",
            },
        },
        {
            section: "subtitle",
            source: {
                type: "range",
                ref: "D3:I3",
                sheet: "Data Entry",
            },
        },
        {
            section: "logo",
            source: {
                type: "range",
                ref: "A2:C3",
                sheet: "Data Entry",
            },
        },
    ];
}
