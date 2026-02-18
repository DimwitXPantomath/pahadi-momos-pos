export const formatOrderNo = (no: number) =>
  `ORD-${no.toString().padStart(3, "0")}`;
