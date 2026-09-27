Pin	Name	Type	Description
**Power**			
8	:chip[VDD]	P	Supply, 1.6 V to 5.5 V. Decouple with 100 nF within 2 mm of the pin.
4	:chip[GND]	G	Ground.
EP	:chip[EP]	G	Exposed pad, the thermal path to the board. Solder it to ground.
**Serial interface**			
1	:chip[SDA]	I/O	Serial data, open drain, 5.5 V-tolerant.
2	:chip[SCL]	I	Serial clock, Schmitt-trigger input.
3	:chip[ALERT]	O	Alert output, open drain. Leave it open when unused.
**Address select**			
5	:chip[A0]	I	Address bit 0. Tie to GND or *V*~DD~, never leave it floating.
6	:chip[A1]	I	Address bit 1. Tie to GND or *V*~DD~.
7	:chip[A2]	I	Address bit 2. Tie to GND or *V*~DD~.
