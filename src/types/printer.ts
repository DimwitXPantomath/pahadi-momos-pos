export type PrinterRole =
  | "BILL"
  | "KOT"
  | "BOTH"

export type PrinterConfig = {
  id: string
  name: string
  role: PrinterRole
}