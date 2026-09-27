Parameter		Symbol	Conditions	Value			Unit
				Min	Typ	Max	
Temperature sensor	Accuracy^1^	*T*~ACC~	−20 °C to 50 °C	−0.1	±0.05	0.1	°C
			−40 °C to 125 °C	−0.3	±0.1	0.3	°C
	Resolution		16-bit result		0.0078		°C
	Repeatability^2^		1 Hz, 100 readings		±0.008		°C
	Long-term drift^2^		500 h at 125 °C		0.02		°C
Power supply	Supply voltage	*V*~DD~		1.6	3.3	5.5	V
	Average supply current^3^	*I*~DD~	1 conversion per second		1.4	2.5	µA
	Supply current, converting	*I*~CONV~			120	175	µA
	Shutdown current	*I*~SD~	bus idle		0.1	0.5	µA
	Power-on reset threshold	*V*~POR~	*V*~DD~ rising		1.2	1.45	V
Conversion	Conversion time	*t*~CONV~	16-bit result		10.5	12	ms
			12-bit result		3.1	3.6	ms
	Conversion rate	*f*~CONV~	continuous mode	0.25		8	Hz
Digital inputs and outputs	High-level input voltage	*V*~IH~		0.7 *V*~DD~			V
	Low-level input voltage	*V*~IL~				0.3 *V*~DD~	V
	Low-level output voltage	*V*~OL~	3 mA sink			0.4	V
	Input leakage current	*I*~IN~		−1		1	µA
	Pin capacitance	*C*~IN~			3		pF
Serial interface	Clock frequency	*f*~SCL~	Fast-mode Plus	1		1000	kHz
	Bus timeout	*t*~TIMEOUT~	SMBus mode	25	30	35	ms
