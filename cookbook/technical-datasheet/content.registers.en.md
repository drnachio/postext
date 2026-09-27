Addr.	Register	Reset	Contents
**Measurement**			
00h	:chip[TEMP]	8000h	The last complete result, read only.\n• 8000h until the first result\n• Signed, in steps of 1/128 °C\n• At 12 bits, bits 3 to 0 read zero\n• Two bytes, most significant first
04h	:chip[STATUS]	00h	Flags, read only. Reading STATUS releases ALERT in interrupt mode.\n• Bit 7, BUSY: still converting\n• Bit 6, HIGH: a result crossed THIGH\n• Bit 5, LOW: a result crossed TLOW\n• Bit 4, TRIM: the trim check failed at power-on
**Configuration**			
01h	:chip[CONFIG]	0000h	Operating mode and alert behavior.\n• Bits 15 and 14, MODE: continuous, one-shot or shutdown\n• Bit 13, RES: a 12-bit result instead of 16 bits\n• Bit 12, AVG: each result averages eight readings\n• Bits 11 and 10, FAULTS: 1, 2, 4 or 6 results beyond a limit before ALERT asserts\n• Bit 9, POL: ALERT active high\n• Bit 8, INT: interrupt mode instead of comparator mode
05h	:chip[RATE]	02h	Conversion rate in continuous mode.\n• 00h to 05h: 0.25, 0.5, 1, 2, 4 or 8 conversions a second\n• Higher values read back as 05h
06h	:chip[ONESHOT]	00h	Any write starts one conversion.\n• Shuts down again afterwards\n• Ignored in continuous mode
07h	:chip[OFFSET]	0000h	Added to every result, in the format of TEMP.\n• From −8 °C to 8 °C\n• Cleared by a power-on reset
**Limits**			
02h	:chip[TLOW]	F600h	Low limit, in the format of TEMP.\n• −20 °C after reset\n• Keep it below THIGH
03h	:chip[THIGH]	3C00h	High limit, in the format of TEMP.\n• 120 °C after reset\n• In comparator mode, ALERT releases below TLOW
**Identification**			
0Eh	:chip[SERIAL]	—	A 48-bit number unique to each part, read only.\n• Read six bytes, from 0Eh
FEh	:chip[MAKER]	5058h	Manufacturer, read only: PX in ASCII.
FFh	:chip[DEVICE]	7021h	Device, read only.\n• Bits 15 to 4: the part number, 702h\n• Bits 3 to 0: the silicon revision
