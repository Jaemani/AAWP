export interface OrderLine {
  unitPriceCents: number;
  quantity: number;
}

export interface Order {
  lines: OrderLine[];
}
