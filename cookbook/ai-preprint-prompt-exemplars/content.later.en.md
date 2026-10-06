## Commonsense Reasoning {#sec-commonsense}

 Although chain of thought is particularly suitable for math word problems, the language-based nature of chain of thought actually makes it applicable to a broad class of commonsense reasoning problems, which involve reasoning about physical and human interactions under the presumption of general background knowledge. Commonsense reasoning is key for interacting with the world and is still beyond the reach of current natural language understanding systems [@talmor2022commonsenseqa].

**Benchmarks.** We consider five datasets covering a diverse range of commonsense reasoning types. The popular **CSQA** [@talmor-etal-2019-commonsenseqa] asks commonsense questions about the world involving complex semantics that often require prior knowledge. **StrategyQA** [@geva-etal-2021-aristotle] requires models to infer a multi-hop strategy to answer questions. We choose two specialized evaluation sets from the BIG-bench effort [@bigbench]: **Date** Understanding, which involves inferring a date from a given context, and **Sports** Understanding, which involves determining whether a sentence relating to sports is plausible or implausible. Finally, the **SayCan** dataset [@ahn2022can] involves mapping a natural language instruction to a sequence of robot actions from a discrete set.

**Prompts.** We follow the same experimental setup as the prior section. For CSQA and StrategyQA, we randomly selected examples from the training set and manually composed chains of thought for them to use as few-shot exemplars. The two BIG-bench tasks do not have training sets, so we selected the first ten examples as exemplars in the evaluation set as few-shot exemplars and report numbers on the rest of the evaluation set. For SayCan, we use six examples from the training set used in @ahn2022can and also manually composed chains of thought.

**Results.** For all tasks, scaling up model size improved the performance of standard prompting; chain-of-thought prompting led to further gains, with improvements appearing to be largest for PaLM 540B. With chain-of-thought prompting, PaLM 540B achieved strong performance relative to baselines, outperforming the prior state of the art on StrategyQA (75.6% vs 69.4%) and outperforming an unaided sports enthusiast on sports understanding (95.4% vs 84%). These results demonstrate that chain-of-thought prompting can also improve performance on tasks requiring a range of commonsense reasoning abilities (though note that gain was minimal on CSQA).

## Symbolic Reasoning {#sec-symbolic}

 Our final experimental evaluation considers symbolic reasoning, which is simple for humans but potentially challenging for language models. We show that chain-of-thought prompting not only enables language models to perform symbolic reasoning tasks that are challenging in the standard prompting setting, but also facilitates length generalization to inference-time inputs longer than those seen in the few-shot exemplars.
 

**Tasks.** We use the following two toy tasks.

- **Last letter concatenation.** This task asks the model to concatenate the last letters of words in a name. It is a more challenging version of first letter concatenation, which language models can already perform without chain of thought.[^davinci] We generate full names by randomly concatenating names from the top one-thousand first and last names from name census data (https://namecensus.com/).
- **Coin flip.** This task asks the model to answer whether a coin is still heads up after people either flip or don’t flip the coin.

As the construction of these symbolic reasoning tasks is well-defined, for each task we consider an *in-domain* test set for which examples had the same number of steps as the training/few-shot exemplars, as well as an *out-of-domain* (OOD) test set, for which evaluation examples had more steps than those in the exemplars. For last letter concatenation, the model only sees exemplars of names with two words, and then performs last letter concatenation on names with 3 and 4 words.[^names] We do the same for the number of potential flips in the coin flip task. Our experimental setup uses the same methods and models as in the prior two sections. We again manually compose chains of thought for the few-shot exemplars for each task.
 

**Results.** Note that these in-domain evaluations are “toy tasks” in the sense that perfect solution structures are already provided by the chains of thought in the few-shot exemplars; all the model has to do is repeat the same steps with the new symbols in the test-time example. And yet, small models still fail—the ability to perform abstract manipulations on unseen symbols for these three tasks only arises at the scale of 100B model parameters.

As for the OOD evaluations, standard prompting fails for both tasks. With chain-of-thought prompting, language models achieve upward scaling curves (though performance is lower than in the in-domain setting). Hence, chain-of-thought prompting facilitates length generalization beyond seen chains of thought for language models of sufficient scale.

## Discussion {#sec-discussion}

 We have explored chain-of-thought prompting as a simple mechanism for eliciting multi-step reasoning behavior in large language models. We first saw that chain-of-thought prompting improves performance by a large margin on arithmetic reasoning, yielding improvements that are much stronger than ablations and robust to different annotators, exemplars, and language models (:ref{id="sec-arithmetic"}). Next, experiments on commonsense reasoning underscored how the linguistic nature of chain-of-thought reasoning makes it generally applicable (:ref{id="sec-commonsense"}). Finally, we showed that for symbolic reasoning, chain-of-thought prompting facilitates OOD generalization to longer sequence lengths (:ref{id="sec-symbolic"}). In all experiments, chain-of-thought reasoning is elicited simply by prompting an off-the-shelf language model. No language models were finetuned in the process of writing this paper.

The emergence of chain-of-thought reasoning as a result of model scale has been a prevailing theme [@wei2022emergent]. For many reasoning tasks where standard prompting has a flat scaling curve, chain-of-thought prompting leads to dramatically increasing scaling curves. Chain-of-thought prompting appears to expand the set of tasks that large language models can perform successfully—in other words, our work underscores that standard prompting only provides a lower bound on the capabilities of large language models. This observation likely raises more questions than it answers—for instance, how much more can we expect reasoning ability to improve with a further increase in model scale? What other prompting methods might expand the range of tasks that language models can solve?

As for limitations, we first qualify that although chain of thought emulates the thought processes of human reasoners, this does not answer whether the neural network is actually “reasoning,” which we leave as an open question. Second, although the cost of manually augmenting exemplars with chains of thought is minimal in the few-shot setting, such annotation costs could be prohibitive for finetuning (though this could potentially be surmounted with synthetic data generation, or zero-shot generalization). Third, there is no guarantee of correct reasoning paths, which can lead to both correct and incorrect answers; improving factual generations of language models is an open direction for future work [@rashkin2021measuring; @ye2022unreliability; @wiegreffe2021reframing, *inter alia*]. Finally, the emergence of chain-of-thought reasoning only at large model scales makes it costly to serve in real-world applications; further research could explore how to induce reasoning in smaller models.

## Conclusions

 We have explored chain-of-thought prompting as a simple and broadly applicable method for enhancing reasoning in language models. Through experiments on arithmetic, symbolic, and commonsense reasoning, we find that chain-of-thought reasoning is an emergent property of model scale that allows sufficiently large language models to perform reasoning tasks that otherwise have flat scaling curves. Broadening the range of reasoning tasks that language models can perform will hopefully inspire further work on language-based approaches to reasoning.

## Acknowledgements {style="back"}

We thank Jacob Devlin, Claire Cui, Andrew Dai, and Ellie Pavlick for providing feedback on the paper.

We thank Jacob Austin, Yuhuai Wu, Henryk Michalewski, Aitor Lewkowycz, Charles Sutton, and Aakanksha Chowdhery for helpful discussions. We thank Sid Maxwell for notifying us about a mistake in the manual error analysis in the original manuscript.

[^davinci]: We tested 10 common names using GPT-3 davinci and it got all but one correct.

[^names]: For names of length longer than 2 words, we concatenate multiple first and last names together.

## References {style="back"}

:::bibliography{title=""}

:::paragraphs{style="colophon"}
Set in Newsreader, IBM Plex Sans and IBM Plex Mono (SIL OFL) · Text: Wei et al. (2022), arXiv:2201.11903v6, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), abridged, with the figures redrawn from the paper’s numbers.
:::
