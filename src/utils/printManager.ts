import { printKOT } from "./printKOT"
import { printReceipt } from "./printReceipt"
import { PrinterConfig } from "@/types/printer"

export function printOrder(order:any, printers: PrinterConfig[]) {

  printers.forEach(printer => {

    if (printer.role === "KOT") {
      printKOT(order)
    }

    if (printer.role === "BILL") {
      printReceipt(order)
    }

    if (printer.role === "BOTH") {
      printKOT(order)
      printReceipt(order)
    }

  })

}