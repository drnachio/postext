## Searches

We present the analysis of 16 days of coincident observations between the two LIGO detectors from September 12 to October 20, 2015. This is a subset of the data from Advanced LIGO’s first observational period that ended on January 12, 2016.

GW150914 is confidently detected by two different types of searches. One aims to recover signals from the coalescence of compact objects, using optimal matched filtering with waveforms predicted by general relativity. The other search targets a broad range of generic transient signals, with minimal assumptions about waveforms. These searches use independent methods, and their response to detector noise consists of different, uncorrelated, events. However, strong signals from binary black hole mergers are expected to be detected by both searches.

### Generic transient search

Designed to operate without a specific waveform model, this search identifies coincident excess power in time-frequency representations of the detector strain data [@klimenko2016; @klimenko2008], for signal frequencies up to 1 kHz and durations up to a few seconds.

The search reconstructs signal waveforms consistent with a common gravitational-wave signal in both detectors using a multidetector maximum likelihood method. Each event is ranked according to the detection statistic
$$\eta_c = \sqrt{2E_c/(1+E_n/E_c)} ,$$
where $E_c$ is the dimensionless coherent signal energy obtained by cross-correlating the two reconstructed waveforms, and $E_n$ is the dimensionless residual noise energy after the reconstructed signal is subtracted from the data. The statistic $\eta_c$ thus quantifies the SNR of the event and the consistency of the data between the two detectors.

Based on their time-frequency morphology, the events are divided into three mutually exclusive search classes, as described in [@ligo-p1500229]: events with time-frequency morphology of known populations of noise transients (class C1), events with frequency that increases with time (class C3), and all remaining events (class C2).

Detected with $\eta_c = 20.0$, GW150914 is the strongest event of the entire search. Consistent with its coalescence signal signature, it is found in the search class C3 of events with increasing time-frequency evolution. Measured on a background equivalent to over 67 400 years of data and including a trials factor of 3 to account for the search classes, its false alarm rate is lower than 1 in 22 500 years. This corresponds to a probability $< 2\times10^{-6}$ of observing one or more noise events as strong as GW150914 during the analysis time, equivalent to $4.6\sigma$. The left panel of :ref{id="fig4"} shows the C3 class results and background.

### Binary coalescence search

This search targets gravitational-wave emission from binary systems with individual masses from 1 to $99\,M_\odot$, total mass less than $100\,M_\odot$, and dimensionless spins up to 0.99 [@ligo-p1500269]. To model systems with total mass larger than $4\,M_\odot$, we use the effective-one-body formalism [@buonanno2000], which combines results from the post-Newtonian approach [@blanchet1995; @blanchet2004] with results from black hole perturbation theory and numerical relativity. The waveform model [@taracchini2014; @purrer2014] assumes that the spins of the merging objects are aligned with the orbital angular momentum, but the resulting templates can, nonetheless, effectively recover systems with misaligned spins in the parameter region of GW150914 [@ligo-p1500269]. Approximately 250 000 template waveforms are used to cover this parameter space.

The search calculates the matched-filter signal-to-noise ratio $\rho(t)$ for each template in each detector and identifies maxima of $\rho(t)$ with respect to the time of arrival of the signal [@allen2012; @sathyaprakash1991; @owen1999]. For each maximum we calculate a chi-squared statistic $\chi^2_r$ to test whether the data in several different frequency bands are consistent with the matching template [@allen2005]. Values of $\chi^2_r$ near unity indicate that the signal is consistent with a coalescence. If $\chi^2_r$ is greater than unity, $\rho(t)$ is reweighted as $\hat\rho = \rho/\{[1+(\chi^2_r)^3]/2\}^{1/6}$ [@abadie2012; @babak2013]. The final step enforces coincidence between detectors by selecting event pairs that occur within a 15-ms window and come from the same template. The 15-ms window is determined by the 10-ms intersite propagation time plus 5 ms for uncertainty in arrival time of weak signals. We rank coincident events based on the quadrature sum $\hat\rho_c$ of the $\hat\rho$ from both detectors [@usman2015].

To produce background data for this search the SNR maxima of one detector are time shifted and a new set of coincident events is computed. Repeating this procedure $\sim 10^7$ times produces a noise background analysis time equivalent to 608 000 years.

To account for the search background noise varying across the target signal space, candidate and background events are divided into three search classes based on template length. The right panel of :ref{id="fig4"} shows the background for the search class of GW150914. The GW150914 detection-statistic value of $\hat\rho_c = 23.6$ is larger than any background event, so only an upper bound can be placed on its false alarm rate. Across the three search classes this bound is 1 in 203 000 years. This translates to a false alarm probability $< 2\times10^{-7}$, corresponding to $5.1\sigma$.

When an event is confidently identified as a real gravitational-wave signal, as for GW150914, the background used to determine the significance of other events is reestimated without the contribution of this event. This is the background distribution shown as a purple line in the right panel of :ref{id="fig4"}. Based on this, the second most significant event has a false alarm rate of 1 per 2.3 years and corresponding Poissonian false alarm probability of 0.02. Waveform analysis of this event indicates that if it is astrophysical in origin it is also a binary black hole merger [@ligo-p1500269].

## Source discussion

The matched-filter search is optimized for detecting signals, but it provides only approximate estimates of the source parameters. To refine them we use general relativity-based models [@taracchini2014; @purrer2014; @hannam2014; @khan2016], some of which include spin precession, and for each model perform a coherent Bayesian analysis to derive posterior distributions of the source parameters [@veitch2015]. The initial and final masses, final spin, distance, and redshift of the source are shown in :ref{id="tab1"}. The spin of the primary black hole is constrained to be $< 0.7$ (90% credible interval) indicating it is not maximally spinning, while the spin of the secondary is only weakly constrained. These source parameters are discussed in detail in [@ligo-p1500218]. The parameter uncertainties include statistical errors and systematic errors from averaging the results of different waveform models.

Using the fits to numerical simulations of binary black hole mergers in [@healy2014; @husa2016], we provide estimates of the mass and spin of the final black hole, the total energy radiated in gravitational waves, and the peak gravitational-wave luminosity [@ligo-p1500218]. The estimated total energy radiated in gravitational waves is $3.0^{+0.5}_{-0.5}\,M_\odot c^2$. The system reached a peak gravitational-wave luminosity of $3.6^{+0.5}_{-0.4}\times10^{56}$ erg/s, equivalent to $200^{+30}_{-20}\,M_\odot c^2/\mathrm{s}$.

GW150914 demonstrates the existence of stellar-mass black holes more massive than $\simeq 25\,M_\odot$, and establishes that binary black holes can form in nature and merge within a Hubble time. Binary black holes have been predicted to form both in isolated binaries [@tutukov1973; @lipunov1997; @belczynski2016] and in dense environments by dynamical interactions [@sigurdsson1993; @portegieszwart2000; @rodriguez2015]. The formation of such massive black holes from stellar evolution requires weak massive-star winds, which are possible in stellar environments with metallicity lower than $\simeq 1/2$ the solar value [@belczynski2010; @spera2015].

## Conclusion

The LIGO detectors have observed gravitational waves from the merger of two stellar-mass black holes. The detected waveform matches the predictions of general relativity for the inspiral and merger of a pair of black holes and the ringdown of the resulting single black hole. These observations demonstrate the existence of binary stellar-mass black hole systems. This is the first direct detection of gravitational waves and the first observation of a binary black hole merger.

## Acknowledgments {style="back"}

The authors gratefully acknowledge the support of the United States National Science Foundation (NSF) for the construction and operation of the LIGO Laboratory and Advanced LIGO as well as the Science and Technology Facilities Council (STFC) of the United Kingdom, the Max-Planck Society (MPS), and the State of Niedersachsen, Germany, for support of the construction of Advanced LIGO and construction and operation of the GEO600 detector.

:::bibliography{title=""}

:::paragraphs{style="colophon"}
Abridged from B. P. Abbott et al. (LIGO Scientific Collaboration and Virgo Collaboration), Phys. Rev. Lett. 116, 061102 (2016), doi:10.1103/PhysRevLett.116.061102, CC BY 3.0: sections and references renumbered, figures redrawn, captions shortened. Figure data from the Gravitational Wave Open Science Center (gwosc.org), a service of the LIGO Scientific Collaboration, the Virgo Collaboration and KAGRA (CC BY 4.0). Set in Gelasio and Albert Sans (SIL OFL); formulas by MathJax.
:::
