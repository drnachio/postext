id: tbl-truth
caption: Research Findings and True Relationships
Research finding	True relationship		
	Yes	No	Total
Yes	$c(1-\beta)R/(R+1)$	$c\alpha/(R+1)$	$c(R+\alpha-\beta R)/(R+1)$
No	$c\beta R/(R+1)$	$c(1-\alpha)/(R+1)$	$c(1-\alpha+\beta R)/(R+1)$
Total	$cR/(R+1)$	$c/(R+1)$	$c$

id: tbl-bias
caption: Research Findings and True Relationships in the Presence of Bias
Research finding	True relationship		
	Yes	No	Total
Yes	$(c[1-\beta]R+uc\beta R)/(R+1)$	$c\alpha+uc(1-\alpha)/(R+1)$	$c(R+\alpha-\beta R+u-u\alpha+u\beta R)/(R+1)$
No	$(1-u)c\beta R/(R+1)$	$(1-u)c(1-\alpha)/(R+1)$	$c(1-u)(1-\alpha+\beta R)/(R+1)$
Total	$cR/(R+1)$	$c/(R+1)$	$c$

id: tbl-teams
caption: Research Findings and True Relationships in the Presence of Multiple Studies
Research finding	True relationship		
	Yes	No	Total
Yes	$cR(1-\beta^n)/(R+1)$	$c(1-[1-\alpha]^n)/(R+1)$	$c(R+1-[1-\alpha]^n-R\beta^n)/(R+1)$
No	$cR\beta^n/(R+1)$	$c(1-\alpha)^n/(R+1)$	$c([1-\alpha]^n+R\beta^n)/(R+1)$
Total	$cR/(R+1)$	$c/(R+1)$	$c$

id: tbl-ppv
caption: PPV of Research Findings for Various Combinations of Power ($1-\beta$), Ratio of True to Not-True Relationships ($R$), and Bias ($u$)
note: The estimated PPVs (positive predictive values) are derived assuming $\alpha = 0.05$ for a single study; here they are computed from Eq. (2).\\RCT, randomized controlled trial.
$1-\beta$	$R$	$u$	Practical example	PPV
0.80	1:1	0.10	Adequately powered RCT with little bias and 1:1 pre-study odds	
0.95	2:1	0.30	Confirmatory meta-analysis of good-quality RCTs	
0.80	1:3	0.40	Meta-analysis of small inconclusive studies	
0.20	1:5	0.20	Underpowered, but well-performed phase I/II RCT	
0.20	1:5	0.80	Underpowered, poorly performed phase I/II RCT	
0.80	1:10	0.30	Adequately powered exploratory epidemiological study	
0.20	1:10	0.30	Underpowered exploratory epidemiological study	
0.20	1:1,000	0.80	Discovery-oriented exploratory research with massive testing	
0.20	1:1,000	0.20	As in previous example, but with more limited bias (more standardized)

id: fig-bias
caption: PPV (Probability That a Research Finding Is True) as a Function of the Pre-Study Odds for Various Levels of Bias, $u$
note: Panels correspond to power of 0.80, 0.50, and 0.20. Drawn in code from Eq. (2) for the values of $u$ in the 2005 legend, with no bias ($u = 0$) dashed; the curves printed in 2005 match $u = 0$, 0.05, 0.20 and 0.80.
alt: Three panels of rising curves: PPV grows with the pre-study odds and falls as bias grows.

id: fig-teams
caption: PPV (Probability That a Research Finding Is True) as a Function of the Pre-Study Odds for Various Numbers of Conducted Studies, $n$
note: Panels correspond to power of 0.80, 0.50, and 0.20. Drawn in code from Eq. (3).
alt: Three panels of rising curves: PPV falls as more teams test the same question.
