Seeds: the five subtotals of the list	:chip[ ]{style="amount" field="order.seeds" format="currency" calc="sum(sub.tomatoes, sub.peppers, sub.beans, sub.squash, sub.greens)"}
Seed savers' circle, $ 12 a year, with the August swap list :chip[ ]{style="tick" field="order.circle" kind="checkbox" on="1" tooltip="Join the seed savers' circle"}	:chip[ ]{style="amount" field="order.circleFee" format="currency" calc="product(order.circle, 12)"}
Postage and packing, any size of order	:chip[$ 4.50]{style="amount"}
A gift to the seed library, if you wish	:chip[ ]{style="entry" field="order.gift" format="currency" tooltip="Gift to the seed library"}
**Total to pay**	:chip[ ]{style="total" field="order.total" format="currency" calc="sum(order.seeds, order.circleFee, 4.50, order.gift)"}
