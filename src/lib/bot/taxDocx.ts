import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  VerticalAlign,
  ShadingType,
} from "docx";
import type { TaxReport } from "./leaderboard";

const PAGE_WIDTH_TWIPS = 11906; // A4
const MARGIN_TWIPS = 720; // 0.5"
const CONTENT_WIDTH = PAGE_WIDTH_TWIPS - MARGIN_TWIPS * 2;

const THIN_BORDER = {
  style: BorderStyle.SINGLE,
  size: 8,
  color: "333333",
};
const BORDERS = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
};

const MONTHS_RU = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

function monthTitleRu(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const mi = (m || 1) - 1;
  const name = MONTHS_RU[mi] ?? ym;
  return `${name} ${y || ""} г.`.trim();
}

function formatMoneyRu(n: number): string {
  const rounded = Math.round(n);
  const abs = Math.abs(rounded);
  const withSpaces = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${withSpaces} ₽`;
}

function formatDateRu(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, mo, d] = value.slice(0, 10).split("-");
    return `${d}.${mo}.${y}`;
  }
  try {
    const dt = new Date(value);
    if (!Number.isNaN(dt.getTime())) {
      const dd = String(dt.getDate()).padStart(2, "0");
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const yy = dt.getFullYear();
      return `${dd}.${mm}.${yy}`;
    }
  } catch {
    /* keep raw */
  }
  return value;
}

function generatedTodayRu(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

function statusLabelRu(status: string): string {
  const map: Record<string, string> = {
    approved: "Ждём выплату",
    pending: "Ожидает",
    none: "Нет заявок",
    new: "В обработке",
    processing: "В обработке",
    awaiting_payout: "Ждём выплату",
    rejected: "Отклонено",
    paid: "Выплачено",
    duplicate: "В обработке",
  };
  return map[status] || status;
}

function refSourceLabel(refType: "admin" | "traffer"): string {
  return refType === "admin" ? "Админ" : "Траффер";
}

function cellParagraph(
  text: string,
  opts: {
    bold?: boolean;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    size?: number;
  } = {}
) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        size: opts.size ?? 18, // 9pt
        font: "Times New Roman",
      }),
    ],
  });
}

function makeCell(
  text: string,
  opts: {
    bold?: boolean;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    width: number;
    shading?: string;
    size?: number;
    columnSpan?: number;
  }
) {
  return new TableCell({
    borders: BORDERS,
    width: { size: opts.width, type: WidthType.DXA },
    columnSpan: opts.columnSpan,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shading
      ? { type: ShadingType.CLEAR, fill: opts.shading }
      : undefined,
    children: [
      cellParagraph(text, {
        bold: opts.bold,
        align: opts.align,
        size: opts.size,
      }),
    ],
  });
}

/**
 * Build a formal Russian accounting .docx for the monthly tax registry.
 */
export async function buildTaxReportDocx(
  report: TaxReport
): Promise<Buffer> {
  const period = monthTitleRu(report.month);
  const generated = generatedTodayRu();
  const s = report.summary;

  const totals = report.rows.reduce(
    (acc, r) => {
      acc.cpa += r.bankCpa;
      acc.sub += r.subscriberPayout;
      acc.traf += r.trafferPayout;
      acc.comp += r.companyProfit;
      return acc;
    },
    { cpa: 0, sub: 0, traf: 0, comp: 0 }
  );

  const summaryPairs: Array<[string, string]> = [
    ["Оборот CPA", formatMoneyRu(s.bankCpa)],
    ["Выплаты подписчикам", formatMoneyRu(s.subscriberPayouts)],
    ["Выплаты трафферам", formatMoneyRu(s.trafferPayouts)],
    ["Прибыль компании", formatMoneyRu(s.companyProfit)],
    ["в т.ч. рефка админов", formatMoneyRu(s.adminRefOwner)],
    ["Выплаченные выводы", formatMoneyRu(s.withdrawalsPaid)],
    ["Количество позиций", String(s.paidPositions)],
  ];

  const summaryLabelW = Math.floor(CONTENT_WIDTH * 0.65);
  const summaryValueW = CONTENT_WIDTH - summaryLabelW;

  const summaryTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [summaryLabelW, summaryValueW],
    rows: summaryPairs.map(
      ([label, value]) =>
        new TableRow({
          children: [
            makeCell(label, {
              width: summaryLabelW,
              bold: true,
              shading: "EEEEEE",
            }),
            makeCell(value, {
              width: summaryValueW,
              align: AlignmentType.RIGHT,
            }),
          ],
        })
    ),
  });

  // Registry column widths (sum ≈ CONTENT_WIDTH)
  const cols = [
    400, // №
    900, // Дата
    1400, // Клиент
    1600, // Продукт
    1000, // Чек
    900, // CPA
    1000, // Подписчику
    1000, // Трафферу
    1000, // Компании
    900, // Источник
    900, // Статус
  ];
  const colSum = cols.reduce((a, b) => a + b, 0);
  const scale = CONTENT_WIDTH / colSum;
  const W = cols.map((c) => Math.floor(c * scale));
  // fix rounding so sum equals CONTENT_WIDTH
  W[W.length - 1] += CONTENT_WIDTH - W.reduce((a, b) => a + b, 0);

  const headerLabels = [
    "№",
    "Дата",
    "Клиент",
    "Продукт",
    "Чек",
    "CPA",
    "Подписчику",
    "Трафферу",
    "Компании",
    "Источник",
    "Статус",
  ];

  const headerRow = new TableRow({
    children: headerLabels.map((label, i) =>
      makeCell(label, {
        width: W[i],
        bold: true,
        shading: "EEEEEE",
        size: 16,
        align: i === 0 || i >= 5 ? AlignmentType.CENTER : AlignmentType.LEFT,
      })
    ),
  });

  const dataRows =
    report.rows.length === 0
      ? [
          new TableRow({
            children: [
              makeCell("Нет позиций за выбранный месяц", {
                width: CONTENT_WIDTH,
                columnSpan: 11,
                align: AlignmentType.CENTER,
              }),
            ],
          }),
        ]
      : report.rows.map(
          (r, i) =>
            new TableRow({
              children: [
                makeCell(String(i + 1), {
                  width: W[0],
                  size: 16,
                  align: AlignmentType.CENTER,
                }),
                makeCell(formatDateRu(r.date), {
                  width: W[1],
                  size: 16,
                }),
                makeCell(r.client, { width: W[2], size: 16 }),
                makeCell(r.product, { width: W[3], size: 16 }),
                makeCell(r.orderId || "—", { width: W[4], size: 16 }),
                makeCell(formatMoneyRu(r.bankCpa), {
                  width: W[5],
                  size: 16,
                  align: AlignmentType.RIGHT,
                }),
                makeCell(formatMoneyRu(r.subscriberPayout), {
                  width: W[6],
                  size: 16,
                  align: AlignmentType.RIGHT,
                }),
                makeCell(formatMoneyRu(r.trafferPayout), {
                  width: W[7],
                  size: 16,
                  align: AlignmentType.RIGHT,
                }),
                makeCell(formatMoneyRu(r.companyProfit), {
                  width: W[8],
                  size: 16,
                  align: AlignmentType.RIGHT,
                }),
                makeCell(refSourceLabel(r.refType), {
                  width: W[9],
                  size: 16,
                }),
                makeCell(statusLabelRu(r.status), {
                  width: W[10],
                  size: 16,
                }),
              ],
            })
        );

  const footerRow = new TableRow({
    children: [
      makeCell("Итого", {
        width: W[0] + W[1] + W[2] + W[3] + W[4],
        columnSpan: 5,
        bold: true,
        shading: "EEEEEE",
      }),
      makeCell(formatMoneyRu(totals.cpa), {
        width: W[5],
        bold: true,
        align: AlignmentType.RIGHT,
        size: 16,
      }),
      makeCell(formatMoneyRu(totals.sub), {
        width: W[6],
        bold: true,
        align: AlignmentType.RIGHT,
        size: 16,
      }),
      makeCell(formatMoneyRu(totals.traf), {
        width: W[7],
        bold: true,
        align: AlignmentType.RIGHT,
        size: 16,
      }),
      makeCell(formatMoneyRu(totals.comp), {
        width: W[8],
        bold: true,
        align: AlignmentType.RIGHT,
        size: 16,
      }),
      makeCell("", {
        width: W[9] + W[10],
        columnSpan: 2,
      }),
    ],
  });

  const registryTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: W,
    rows: [headerRow, ...dataRows, footerRow],
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: PAGE_WIDTH_TWIPS,
              height: 16838,
            },
            margin: {
              top: MARGIN_TWIPS,
              bottom: MARGIN_TWIPS,
              left: MARGIN_TWIPS,
              right: MARGIN_TWIPS,
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: "РЕЕСТР ОПЕРАЦИЙ ЗА МЕСЯЦ",
                bold: true,
                size: 28,
                font: "Times New Roman",
                allCaps: true,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: `Период: ${period}`,
                size: 20,
                font: "Times New Roman",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: `Дата формирования: ${generated}`,
                size: 20,
                font: "Times New Roman",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: "РКО · партнёрский кабинет",
                size: 18,
                font: "Times New Roman",
                color: "555555",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: "Документ для внутреннего учёта и подготовки отчётности. Суммы в рублях.",
                size: 18,
                font: "Times New Roman",
                color: "444444",
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 120, after: 120 },
            children: [
              new TextRun({
                text: "Сводка",
                bold: true,
                size: 22,
                font: "Times New Roman",
              }),
            ],
          }),
          summaryTable,
          new Paragraph({
            spacing: { before: 240, after: 120 },
            children: [
              new TextRun({
                text: "Реестр",
                bold: true,
                size: 22,
                font: "Times New Roman",
              }),
            ],
          }),
          registryTable,
          new Paragraph({
            spacing: { before: 400 },
            children: [
              new TextRun({
                text: "Ответственный _______________                    Дата _______________",
                size: 20,
                font: "Times New Roman",
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
