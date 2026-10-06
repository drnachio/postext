## Theoretical Analysis of DPO {#sec:theory}

### Your Language Model Is Secretly a Reward Model

DPO is able to bypass both fitting an explicit reward and performing RL to learn the policy using a single maximum likelihood objective. Note the optimization objective Eq.~\eqref{eq:main} is equivalent to a Bradley-Terry model with a reward parameterization $r^*(x, y) = \beta \log\frac{\pi^*_\theta(y \mid x)}{\pi_\text{ref}(y \mid x)}$ and we optimize our parametric model $\pi_{\theta}$, equivalently to the reward model optimization in Eq.~\eqref{eq:reward-model} under the change of variables. In this section we will build the theory behind this reparameterization, show that it does not constrain the class of learned reward models, and allows for the exact recovery of the optimal policy. We begin with by defining an equivalence relation between reward functions.

:::callout{type="definition" #def:equivalent}
We say that two reward functions $r(x, y)$ and $r'(x, y)$ are equivalent iff $r(x, y)-r'(x, y) = f(x)$ for some function $f$.
:::

It is easy to see that this is indeed an equivalence relation, which partitions the set of reward functions into classes. We can state the following two lemmas:

:::callout{type="lemma" #lem:same-preference}
Under the Plackett-Luce, and in particular the Bradley-Terry, preference framework, two reward functions from the same class induce the same preference distribution.
:::

:::callout{type="lemma" #lem:same-policy}
Two reward functions from the same equivalence class induce the same optimal policy under the constrained RL problem.
:::

The proofs are straightforward and we defer them to Appendix :ref{id="app:lemmas" style="number"}. The first lemma is a well-known under-specification issue with the Plackett-Luce family of models [@plackett1975analysis]. The second lemma states that all reward functions from the same class yield the same optimal policy, hence for our final objective, we are only interested in recovering an arbitrary reward function from the optimal class.

:::callout{type="theorem" #thm:main}
Under mild assumptions, all reward classes consistent with the Plackett-Luce (and Bradley-Terry in particular) models can be represented with the reparameterization $r(x, y) = \beta \log \frac{\pi(y\mid x)}{\pi_\text{ref}(y\mid x)}$ for some model $\pi(y\mid x)$ and a given reference model $\pi_\text{ref}(y \mid x)$.
:::

:::callout{type="sketch"}
Consider any reward function $r(x, y)$, which induces a corresponding optimal model $\pi_r(y \mid x)$, specified by Eq.~\eqref{eq:op-policy}. We will show that a reward function from the equivalence class of $r$ can be represented using the reparameterization given above. We define the projection $f$ as
$$
f(r; \pi_\text{ref}, \beta)(x, y) = r(x, y) - \beta\log\sum_{y}\pi_\text{ref}(y\mid x)\exp\left(\frac{1}{\beta}r(x, y)\right) \label{eq:projection}
$$
The operator $f$ simply normalizes the reward function with the logarithm of the partition function of $\pi_r$. Since the added normalization term is only a function of the prefix $x$, $f(r; \pi_\text{ref}, \beta)(x, y)$ is a reward function in the equivalence class of $r(x, y)$. Finally, replacing $r$ with the RHS of Eq.~\eqref{eq:main} (which holds for any reward function), we have $f(r; \pi_\text{ref}, \beta)(x, y) = \beta \log \frac{\pi_r(y\mid x)}{\pi_\text{ref}(y\mid x)}$. That is, the projection $f$ produces a member of the equivalence class of $r$ with the desired form, and we do not lose any generality in our reward model from the proposed reparameterization.
:::

## Experiments {#sec:experiments}

### Generalization to a new input distribution {startAt=3}

To further compare the performance of PPO and DPO under distribution shifts, we evaluate the PPO and DPO policies from our Reddit TL;DR summarization experiment on a different distribution, news articles in the test split of the CNN/DailyMail dataset [@nallapati-etal-2016-abstractive], using the best sampling temperatures from TL;DR (0 and 0.25). The results are presented in :ref{id="ood" style="full"}. For this new distribution, DPO continues to outperform the PPO policy by a significant margin.

::resource{id="ood"}

## Discussion {#sec:discussion}

Learning from preferences is a powerful, scalable framework for training capable, aligned language models. We have introduced DPO, a simple training paradigm for training language models from preferences without reinforcement learning. With virtually no tuning of hyperparameters, DPO performs similarly or better than existing RLHF algorithms, including those based on PPO; DPO thus meaningfully reduces the barrier to training more language models from human preferences.

## References {#sec:references style="back"}

:::bibliography{title=""}
