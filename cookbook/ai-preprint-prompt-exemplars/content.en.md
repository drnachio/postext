---
title: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models"
author: "Jason Wei, Xuezhi Wang, Dale Schuurmans, Maarten Bosma, Brian Ichter, Fei Xia, Ed H. Chi, Quoc V. Le, Denny Zhou"
nocite: "@jie2022learning, @lan2021mwptoolkit"
---

# Chain-of-Thought Prompting Elicits Reasoning \\ in Large Language Models {style="paper" venue="NeurIPS 2022 · arXiv:2201.11903v6 · abridged re-setting" authors="Jason Wei   Xuezhi Wang   Dale Schuurmans   Maarten Bosma\nBrian Ichter   Fei Xia   Ed H. Chi   Quoc V. Le   Denny Zhou" affiliation="Google Research, Brain Team" note="Abridged from the paper’s version 6 (CC BY 4.0). Sections 3.3, 3.4 and 7 (Related Work) and the appendices are omitted, the figures are redrawn, and figure and table numbers follow the original."}

:::callout{type="abstract" title="Abstract"}
We explore how generating a *chain of thought*—a series of intermediate reasoning steps—significantly improves the ability of large language models to perform complex reasoning. In particular, we show how such reasoning abilities emerge naturally in sufficiently large language models via a simple method called *chain-of-thought prompting*, where a few chain of thought demonstrations are provided as exemplars in prompting.

Experiments on three large language models show that chain-of-thought prompting improves performance on a range of arithmetic, commonsense, and symbolic reasoning tasks. The empirical gains can be striking. For instance, prompting a PaLM 540B with just eight chain-of-thought exemplars achieves state-of-the-art accuracy on the GSM8K benchmark of math word problems, surpassing even finetuned GPT-3 with a verifier.
:::

:::callout{#fig-prompting type="figure"}
:::columns{count=2 breaks="4"}
**Standard Prompting**

:::callout{type="input" label="Model Input"}
Q: Roger has 5 tennis balls. He buys 2 more cans of tennis balls. Each can has 3 tennis balls. How many tennis balls does he have now?

A: The answer is 11.

Q: The cafeteria had 23 apples. If they used 20 to make lunch and bought 6 more, how many apples do they have?
:::

:::callout{type="wrong" label="Model Output"}
A: The answer is 27.
:::

**Chain-of-Thought Prompting**

:::callout{type="input" label="Model Input"}
Q: Roger has 5 tennis balls. He buys 2 more cans of tennis balls. Each can has 3 tennis balls. How many tennis balls does he have now?

A: **Roger started with 5 balls. 2 cans of 3 tennis balls each is 6 tennis balls. 5 + 6 = 11.** The answer is 11.

Q: The cafeteria had 23 apples. If they used 20 to make lunch and bought 6 more, how many apples do they have?
:::

:::callout{type="right" label="Model Output"}
A: **The cafeteria had 23 apples originally. They used 20 to make lunch. So they had 23 - 20 = 3. They bought 6 more apples, so they have 3 + 6 = 9.** The answer is 9.
:::
:::

**Figure 1.** Chain-of-thought prompting enables large language models to tackle complex arithmetic, commonsense, and symbolic reasoning tasks. Chain-of-thought reasoning processes are highlighted.
:::

## Introduction {#sec-intro}

The NLP landscape has recently been revolutionized by language models [@peters-etal-2018-deep; @devlin-etal-2019-bert; @brown2020language, , inter alia]. Scaling up the size of language models has been shown to confer a range of benefits, such as improved performance and sample efficiency [@kaplan2020scaling; @brown2020language, , inter alia]. However, scaling up model size alone has not proved sufficient for achieving high performance on challenging tasks such as arithmetic, commonsense, and symbolic reasoning [@rae2021scaling].

This work explores how the reasoning ability of large language models can be unlocked by a simple method motivated by two ideas. First, techniques for arithmetic reasoning can benefit from generating natural language rationales that lead to the final answer. Prior work has given models the ability to generate natural language intermediate steps by training from scratch [@ling-etal-2017-program] or finetuning a pretrained model [@cobbe2021training], in addition to neuro-symbolic methods that use formal languages instead of natural language [@roy-roth-2015-solving; @chiang-chen-2019-semantically; @amini-etal-2019-mathqa; @chen2019neural]. Second, large language models offer the exciting prospect of in-context few-shot learning via *prompting*. That is, instead of finetuning a separate language model checkpoint for each new task, one can simply “prompt” the model with a few input–output exemplars demonstrating the task. Remarkably, this has been successful for a range of simple question-answering tasks [@brown2020language].

Both of the above ideas, however, have key limitations. For rationale-augmented training and finetuning methods, it is costly to create a large set of high quality rationales, which is much more complicated than simple input–output pairs used in normal machine learning. For the traditional few-shot prompting method used in @brown2020language, it works poorly on tasks that require reasoning abilities, and often does not improve substantially with increasing language model scale [@rae2021scaling]. In this paper, we combine the strengths of these two ideas in a way that avoids their limitations. Specifically, we explore the ability of language models to perform few-shot prompting for reasoning tasks, given a prompt that consists of triples: ‹input, *chain of thought*, output›. A *chain of thought* is a series of intermediate natural language reasoning steps that lead to the final output, and we refer to this approach as *chain-of-thought prompting*. An example prompt is shown in :ref{id="fig-prompting" text="Figure 1"}.

We present empirical evaluations on arithmetic, commonsense, and symbolic reasoning benchmarks, showing that chain-of-thought prompting outperforms standard prompting, sometimes to a striking degree. :ref{id="fig-gsm8k"} illustrates one such result—on the GSM8K benchmark of math word problems [@cobbe2021training], chain-of-thought prompting with PaLM 540B outperforms standard prompting by a large margin and achieves new state-of-the-art performance. A prompting only approach is important because it does not require a large training dataset and because a single model checkpoint can perform many tasks without loss of generality. This work underscores how large language models can learn via a few examples with natural language data about the task (c.f. automatically learning the patterns underlying inputs and outputs via a large training dataset).

## Chain-of-Thought Prompting {#sec-cot}

Consider one’s own thought process when solving a complicated reasoning task such as a multi-step math word problem. It is typical to decompose the problem into intermediate steps and solve each before giving the final answer: *“After Jane gives 2 flowers to her mom she has 10 … then after she gives 3 to her dad she will have 7 … so the answer is 7.”* The goal of this paper is to endow language models with the ability to generate a similar *chain of thought*—a coherent series of intermediate reasoning steps that lead to the final answer for a problem. We will show that sufficiently large language models can generate chains of thought if demonstrations of chain-of-thought reasoning are provided in the exemplars for few-shot prompting.

:ref{id="fig-prompting" text="Figure 1"} shows an example of a model producing a chain of thought to solve a math word problem that it would have otherwise gotten incorrect. The chain of thought in this case resembles a solution and can interpreted as one, but we still opt to call it a chain of thought to better capture the idea that it mimics a step-by-step thought process for arriving at the answer (and also, solutions/explanations typically come *after* the final answer [@narang2020wt5; @wiegreffe2021reframing; @lampinen2022can, , inter alia]).

Chain-of-thought prompting has several attractive properties as an approach for facilitating reasoning in language models.

1. First, chain of thought, in principle, allows models to decompose multi-step problems into intermediate steps, which means that additional computation can be allocated to problems that require more reasoning steps.
2. Second, a chain of thought provides an interpretable window into the behavior of the model, suggesting how it might have arrived at a particular answer and providing opportunities to debug where the reasoning path went wrong (although fully characterizing a model’s computations that support an answer remains an open question).
3. Third, chain-of-thought reasoning can be used for tasks such as math word problems, commonsense reasoning, and symbolic manipulation, and is potentially applicable (at least in principle) to any task that humans can solve via language.
4. Finally, chain-of-thought reasoning can be readily elicited in sufficiently large off-the-shelf language models simply by including examples of chain of thought sequences into the exemplars of few-shot prompting.

In empirical experiments, we will observe the utility of chain-of-thought prompting for arithmetic reasoning (:ref{id="sec-arithmetic"}), commonsense reasoning (:ref{id="sec-commonsense"}), and symbolic reasoning (:ref{id="sec-symbolic"}).

## Arithmetic Reasoning {#sec-arithmetic}

We begin by considering math word problems of the form in :ref{id="fig-prompting" text="Figure 1"}, which measure the arithmetic reasoning ability of language models. Though simple for humans, arithmetic reasoning is a task where language models often struggle [@hendrycks2021measuring; @patel-etal-2021-nlp, , inter alia]. Strikingly, chain-of-thought prompting when used with the 540B parameter language model performs comparably with task-specific finetuned models on several tasks, even achieving new state of the art on the challenging GSM8K benchmark [@cobbe2021training].

### Experimental Setup

We explore chain-of-thought prompting for various language models on multiple benchmarks.

**Benchmarks.** We consider the following five math word problem benchmarks: **(1)** the **GSM8K** benchmark of math word problems [@cobbe2021training], **(2)** the **SVAMP** dataset of math word problems with varying structures [@patel-etal-2021-nlp], **(3)** the **ASDiv** dataset of diverse math word problems [@miao-etal-2020-diverse], **(4)** the **AQuA** dataset of algebraic word problems, and **(5)** the **MAWPS** benchmark [@koncel-kedziorski-etal-2016-mawps].

**Standard prompting.** For the baseline, we consider standard few-shot prompting, popularized by @brown2020language, in which a language model is given in-context exemplars of input–output pairs before outputting a prediction for a test-time example. Exemplars are formatted as questions and answers. The model gives the answer directly, as shown in :ref{id="fig-prompting" text="Figure 1"} (left).

**Chain-of-thought prompting.** Our proposed approach is to augment each exemplar in few-shot prompting with a chain of thought for an associated answer, as illustrated in :ref{id="fig-prompting" text="Figure 1"} (right). As most of the datasets only have an evaluation split, we manually composed a set of eight few-shot exemplars with chains of thought for prompting—:ref{id="fig-prompting" text="Figure 1"} (right) shows one chain of thought exemplar. To investigate whether chain-of-thought prompting in this form can successfully elicit successful reasoning across a range of math word problems, we used this single set of eight chain of thought exemplars for all benchmarks except AQuA, which is multiple choice instead of free response.

**Language models.** We evaluate five large language models. The first is **GPT-3** [@brown2020language], for which we use text-ada-001, text-babbage-001, text-curie-001, and text-davinci-002, which presumably correspond to InstructGPT models of 350M, 1.3B, 6.7B, and 175B parameters [@ouyang2022training]. The second is **LaMDA** [@thoppilan2022lamda], which has models of 422M, 2B, 8B, 68B, and 137B parameters. The third is **PaLM**, which has models of 8B, 62B, and 540B parameters. The fourth is **UL2 20B** [@tay2022unifying], and the fifth is **Codex** [@chen2021evaluating, , code-davinci-002 in the OpenAI API]. We sample from the models via greedy decoding (though follow-up work shows chain-of-thought prompting can be improved by taking the majority final answer over many sampled generations [@wang2022self]). For LaMDA, we report averaged results over five random seeds, where each seed had a different randomly shuffled order of exemplars. As LaMDA experiments did not show large variance among different seeds, to save compute we report results for a single exemplar order for all other models.

### Results

The strongest results of chain-of-thought prompting are summarized in :ref{id="fig-scale"}, with all experimental outputs for each model collection, model size, and benchmark shown in :ref{id="tab-math"}. There are three key takeaways. First, :ref{id="fig-scale"} shows that chain-of-thought prompting is an emergent ability of model scale [@wei2022emergent]. That is, chain-of-thought prompting does not positively impact performance for small models, and only yields performance gains when used with models of \~100B parameters. We qualitatively found that models of smaller scale produced fluent but illogical chains of thought, leading to lower performance than standard prompting.

Second, chain-of-thought prompting has larger performance gains for more-complicated problems. For instance, for GSM8K (the dataset with the lowest baseline performance), performance more than doubled for the largest GPT and PaLM models.

Third, chain-of-thought prompting via GPT-3 175B and PaLM 540B compares favorably to prior state of the art, which typically finetunes a task-specific model on a labeled training dataset. :ref{id="fig-scale"} shows how PaLM 540B uses chain-of-thought prompting to achieve new state of the art on GSM8K, SVAMP, and MAWPS (though note that standard prompting already passed the prior best for SVAMP). On the other two datasets, AQuA and ASDiv, PaLM with chain-of-thought prompting reaches within 2% of the state of the art.

To better understand why chain-of-thought prompting works, we manually examined model-generated chains of thought by LaMDA 137B for GSM8K. Of 50 random examples where the model returned the correct final answer, all of the generated chains of thought were also logically and mathematically correct except two that coincidentally arrived at the correct answer. We also randomly examined 50 random samples for which the model gave the wrong answer. The summary of this analysis is that 46% of the chains of thought were almost correct, barring minor mistakes (calculator error, symbol mapping error, or one reasoning step missing), and that the other 54% of the chains of thought had major errors in semantic understanding or coherence. To provide a small insight into why scaling improves chain-of-thought reasoning ability, we performed a similar analysis of errors made by PaLM 62B and whether those errors were fixed by scaling to PaLM 540B. The summary is that scaling PaLM to 540B fixes a large portion of one-step missing and semantic understanding errors in the 62B model.
