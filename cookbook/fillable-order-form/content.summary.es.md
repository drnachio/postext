Semillas: los cinco subtotales de la lista	:chip[ ]{style="amount" field="order.seeds" format="currency" calc="sum(sub.tomatoes, sub.peppers, sub.beans, sub.squash, sub.greens)"}
Círculo de guardianes de semillas, 10 € al año, con la lista del intercambio de agosto :chip[ ]{style="tick" field="order.circle" kind="checkbox" on="1" tooltip="Hacerse socio del círculo"}	:chip[ ]{style="amount" field="order.circleFee" format="currency" calc="product(order.circle, 10)"}
Envío y embalaje, sea cual sea el pedido	:chip[3,90 €]{style="amount"}
Un donativo para la biblioteca de semillas, si quieres	:chip[ ]{style="entry" field="order.gift" format="currency" tooltip="Donativo para la biblioteca de semillas"}
**Total a pagar**	:chip[ ]{style="total" field="order.total" format="currency" calc="sum(order.seeds, order.circleFee, 3.90, order.gift)"}
