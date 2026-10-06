## Mathematical Derivations {style="appendix" startAt=1}

### Deriving the Optimum of the KL-Constrained Reward Maximization Objective {#app:derivation style="appendix-sub"}

In this appendix, we will derive Eq.~\eqref{eq:op-policy}. Analogously to Eq.~\eqref{eq:rl}, we optimize the following objective:
$$
\max_{\pi} \mathbb{E}_{x\sim \mathcal{D}, y\sim \pi}\bigl[r(x, y)\bigr] - \beta\mathbb{D}_{\textrm{KL}}\bigl[\pi(y|x)||\pi_\text{ref}(y|x)\bigr] \label{eq:a-objective}
$$
under any reward function $r(x,y)$, reference model $\pi_\text{ref}$ and a general non-parametric policy class. We now have:
$$
\begin{align}
&\max_{\pi} \mathbb{E}_{x\sim \mathcal{D}, y\sim \pi}\bigl[r(x, y)\bigr] - \beta\mathbb{D}_{\textrm{KL}}\bigl[\pi(y|x)\mid\mid\pi_\text{ref}(y|x)\bigr] \notag\\
&\quad=\max_{\pi} \mathbb{E}_{x\sim \mathcal{D}}\mathbb{E}_{y\sim \pi(y|x)}\left[r(x, y) - \beta\log\frac{\pi(y|x)}{\pi_\text{ref}(y|x)}\right] \notag\\
&\quad=\min_{\pi} \mathbb{E}_{x\sim \mathcal{D}}\mathbb{E}_{y\sim \pi(y|x)}\left[\log\frac{\pi(y|x)}{\pi_\text{ref}(y|x)} - \frac{1}{\beta}r(x, y)\right] \notag\\
&\quad=\min_{\pi} \mathbb{E}_{x\sim \mathcal{D}}\mathbb{E}_{y\sim \pi(y|x)}\left[\log\frac{\pi(y|x)}{\frac{1}{Z(x)}\pi_\text{ref}(y|x)\exp\left(\frac{1}{\beta}r(x, y)\right)} - \log Z(x)\right] \label{eq:rl-proof}
\end{align}
$$
where we have partition function:
$$
Z(x) = \sum_{y}\pi_\text{ref}(y|x)\exp\left(\frac{1}{\beta}r(x, y)\right).
$$
Note that the partition function is a function of only $x$ and the reference policy $\pi_\text{ref}$, but does not depend on the policy $\pi$. We can now define
$$
\pi^*(y|x) = \frac{1}{Z(x)}\pi_\text{ref}(y|x)\exp\left(\frac{1}{\beta}r(x, y)\right),
$$
which is a valid probability distribution as $\pi^*(y|x)\geq 0$ for all $y$ and $\sum_{y}\pi^*(y|x)=1$. Since $Z(x)$ is not a function of $y$, we can then re-organize the final objective in Eq.~\eqref{eq:rl-proof} as:
$$
\begin{align}
&\min_{\pi} \mathbb{E}_{x\sim \mathcal{D}}\left[\mathbb{E}_{y\sim \pi(y|x)}\left[\log\frac{\pi(y|x)}{\pi^*(y|x)}\right] - \log Z(x)\right]= \label{eq:a-min}\\
&\min_{\pi}\mathbb{E}_{x\sim\mathcal{D}}\left[\mathbb{D}_{\text{KL}}(\pi(y|x)\mid\mid\pi^*(y|x)) - \log Z(x)\right] \label{eq:a-kl}
\end{align}
$$
Now, since $Z(x)$ does not depend on $\pi$, the minimum is achieved by the policy that minimizes the first KL term. Gibbs’ inequality tells us that the KL-divergence is minimized at 0 if and only if the two distributions are identical. Hence we have the optimal solution:
$$
\pi(y|x)= \pi^*(y|x) = \frac{1}{Z(x)}\pi_\text{ref}(y|x)\exp\left(\frac{1}{\beta}r(x, y)\right) \label{eq:a-optimum}
$$
for all $x\in\mathcal{D}$. This completes the derivation.

### Proof of Lemma \ref{lem:same-preference} and \ref{lem:same-policy} {#app:lemmas style="appendix-sub" startAt=5}

:::callout{type="restated"}
***:ref{id="lem:same-preference"} Restated.*** Under the Plackett-Luce preference framework, and in particular the Bradley-Terry framework, two reward functions from the same equivalence class induce the same preference distribution.
:::

:::callout{type="proof"}
We say that two reward functions $r(x, y)$ and $r'(x, y)$ are from the same equivalence class if $r'(x, y) = r(x, y) + f(x)$ for some function $f$. We consider the general Plackett-Luce (with the Bradley-Terry model a special case for $K=2$) and denote the probability distribution over rankings induced by a particular reward function $r(x, y)$ as $p_r$. For any prompt $x$, answers $y_1,\ldots, y_K$ and ranking $\tau$ we have:
$$
\begin{aligned}
p_{r'}(\tau| y_1,\ldots, y_K, x) &= \prod_{k=1}^{K}\frac{\exp(r'(x, y_{\tau(k)}))}{\sum_{j=k}^{K}\exp(r'(x, y_{\tau(j)}))} \\
&= \prod_{k=1}^{K}\frac{\exp(r(x, y_{\tau(k)}) + f(x))}{\sum_{j=k}^{K}\exp(r(x, y_{\tau(j)})+f(x))} \\
&= \prod_{k=1}^{K}\frac{\exp(f(x))\exp(r(x, y_{\tau(k)}))}{\exp(f(x))\sum_{j=k}^{K}\exp(r(x, y_{\tau(j)}))} \\
&= \prod_{k=1}^{K}\frac{\exp(r(x, y_{\tau(k)}))}{\sum_{j=k}^{K}\exp(r(x, y_{\tau(j)}))} \\
&= p_{r}(\tau| y_1,\ldots, y_K, x),
\end{aligned}
$$
which completes the proof.
:::

:::paragraphs{style="colophon"}
Abridged and re-set for the Postext Cookbook from arXiv:2305.18290v3 (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/). Sections 2 and 5.2, most of section 6 and appendices A.2–A.4, A.6 and B–E are cut; section numbers are the original ones, equations are renumbered. Figure 1 is redrawn in code. Set in Spectral, Work Sans and JetBrains Mono (SIL OFL); formulas by MathJax.
:::
