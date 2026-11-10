---
title: "A Pocket Primer of Logic"
author: "Ignacio Ferro"
---

# Reading the Signs {kicker="A pocket primer of logic · Chapter 1" signs="∀ ∃ → ∈ ∪ ∅ ℵ"}

A page of logic looks like a page of algebra that has lost its numbers. Its letters stand for sentences, for objects and for collections of objects, and a dozen signs hold them together. Most of those signs are younger than the telephone: Giuseppe Peano printed the first of the modern ones in 1889, and Gerhard Gentzen added the last of the common ones in 1935. This chapter reads them one at a time, in the order a first course meets them, and gives each its name in words, so that any formula can be read aloud as a sentence.

## Sentences and connectives

A letter such as *p* or *q* stands for a whole sentence that is either true or false: *it is raining*, *the train is late*. Five signs build longer sentences out of shorter ones. ¬*p* reads “not *p*” and is true exactly when *p* is false. *p* ∧ *q*, “*p* and *q*”, is true when both are. *p* ∨ *q*, “*p* or *q*”, is true when at least one is; the sign is a stylised *v*, for the Latin *vel*, the “or” that allows both. *p* → *q*, “if *p* then *q*”, is false in one case only, when *p* is true and *q* is false. *p* ↔ *q*, “*p* if and only if *q*”, is true when the two sides agree.

Table 1.1 sets the five side by side. Each row is one way the world could be, and each column is one sentence, read off from the two letters on the left.

::resource{id="truth"}

The table settles questions that intuition gets wrong. The third and fourth rows show that *p* → *q* is true whenever *p* is false, whatever *q* says: a promise whose condition was never met has not been broken. The table also proves De Morgan’s laws, which turn the negation of an “or” into an “and” of negations, and the other way round:

:::paragraphs{style="formula"}
¬(*p* ∨ *q*) ↔ (¬*p* ∧ ¬*q*) \
¬(*p* ∧ *q*) ↔ (¬*p* ∨ ¬*q*)
:::

## Quantifiers: ∀ and ∃

Sentence letters cannot see inside a sentence. *All humans are mortal* and *Socrates is human* share no letter, and yet together they give *Socrates is mortal*. Predicate logic splits a sentence into a predicate and the things it is said of: *Hx* for “*x* is human”, *Mx* for “*x* is mortal”, *s* for Socrates. Two quantifiers then say how many things a predicate holds of. ∀*x*, “for every *x*”, is an A turned upside down; ∃*x*, “there is an *x*”, is an E turned back to front.

:::paragraphs{style="formula"}
∀*x* (*Hx* → *Mx*) \
*Hs* → *Ms*
:::

The first line is the major premise of the oldest syllogism in the textbooks, and the second is what it says of Socrates in particular. The two quantifiers are tied together by negation. To deny that everything has a property is to say that something lacks it, and to deny that something has it is to say that everything lacks it:

:::paragraphs{style="formula"}
¬∀*x* φ ↔ ∃*x* ¬φ \
¬∃*x* φ ↔ ∀*x* ¬φ
:::

The Greek letters φ and ψ are not part of the formula language. Each stands for any formula at all, so each line above is a pattern with infinitely many instances. Logicians keep the Greek alphabet for this talk about formulas and the Latin one for the formulas themselves. A capital gamma, Γ, usually names a set of premises, and Γ ⊢ φ says that φ can be derived from them.

## Sets: ∈, ∪, ∩ and ∅

A set is a collection taken as one object. *a* ∈ *A* says that *a* is a member of *A*, and *a* ∉ *A* that it is not. *A* ⊆ *B* says that every member of *A* is a member of *B*; *A* ⊂ *B* adds that *B* has some member more. With the connectives and the quantifiers, each of these comes down to a sentence about members:

:::paragraphs{style="formula"}
*A* ⊆ *B* ↔ ∀*x* (*x* ∈ *A* → *x* ∈ *B*) \
*x* ∈ *A* ∪ *B* ↔ (*x* ∈ *A* ∨ *x* ∈ *B*) \
*x* ∈ *A* ∩ *B* ↔ (*x* ∈ *A* ∧ *x* ∈ *B*)
:::

The union ∪ is built on the “or” and the intersection ∩ on the “and”, and the shapes keep the kinship in view: ∪ opens upward like ∨, ∩ downward like ∧. The empty set ∅ has no members, ∀*x* (*x* ∉ ∅), and it is a subset of every set *A*, because the condition of ∀*x* (*x* ∈ ∅ → *x* ∈ *A*) is never met.

Not every condition defines a set. In June 1902 Bertrand Russell wrote to Gottlob Frege about the collection of all sets that are not members of themselves. Call it *R*. If *R* ∈ *R*, then *R* fails its own condition, so *R* ∉ *R*; if *R* ∉ *R*, it meets the condition, so *R* ∈ *R*. Frege’s system allowed *R*, and with it *R* ∈ *R* ↔ *R* ∉ *R*, a contradiction. The set theories taught today do not let such a collection be a set.

## Counting the infinite: ℵ

Two sets have the same size when their members can be paired off one to one. The natural numbers, ℕ, and the even numbers pair off by sending each *n* to 2*n*, so an infinite set can be as large as a part of itself. Georg Cantor denoted the size of ℕ by ℵ~0~, aleph-null, from the first letter of the Hebrew alphabet, and showed in 1891 that the real numbers cannot be paired off with ℕ: any list of them leaves one out. There are therefore at least two infinite sizes, and his alephs ℵ~0~, ℵ~1~, ℵ~2~ name them in order.

## Where the signs come from

The signs in this chapter came into print one at a time, from different hands; Table 1.2 names who put each of them into general use.

::resource{id="signs"}

:::paragraphs{style="colophon"}
Set in Crimson Pro, Cormorant Garamond and IBM Plex Sans Condensed, with the signs from Noto Sans Math (SIL Open Font License) · Text: original, CC BY 4.0.
:::
