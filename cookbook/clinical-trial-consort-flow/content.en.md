---
title: "Delivering Cognitive Behavior Therapy to Young Adults With Symptoms of Depression and Anxiety Using a Fully Automated Conversational Agent (Woebot): A Randomized Controlled Trial"
author: "Kathleen Kara Fitzpatrick, Alison Darcy and Molly Vierhile"
---

# Delivering Cognitive Behavior Therapy to Young Adults With Symptoms of Depression and Anxiety Using a Fully Automated Conversational Agent (Woebot): A Randomized Controlled Trial {style="article" kind="Randomized controlled trial · Digital mental health" authors="Kathleen Kara Fitzpatrick, PhD^1^\*, Alison Darcy, PhD^2^\*, Molly Vierhile, BA^1^" affiliations="^1^ Stanford School of Medicine, Department of Psychiatry and Behavioral Sciences, Stanford, CA, United States\n^2^ Woebot Labs Inc., San Francisco, CA, United States\n\* Contributed equally. Corresponding author: Alison Darcy, PhD" history="Received 29 March 2017 · Revised 5 May 2017 · Accepted 22 May 2017 · Published 6 June 2017" source="Abridged from JMIR Mental Health 2017;4(2):e19, doi:10.2196/mental.7785 · © the authors, CC BY 4.0"}

:::callout{type="abstract" title="Abstract" span="page"}
:::columns{count=2}
**Background** Web-based cognitive-behavioral therapeutic (CBT) apps have demonstrated efficacy but are characterized by poor adherence. Conversational agents may offer a convenient, engaging way of getting support at any time.

**Objective** The objective of the study was to determine the feasibility, acceptability, and preliminary efficacy of a fully automated conversational agent to deliver a self-help program for college students who self-identify as having symptoms of anxiety and depression.

**Methods** In an unblinded trial, 70 individuals age 18-28 years were recruited online from a university community social media site and were randomized to receive either 2 weeks (up to 20 sessions) of self-help content derived from CBT principles in a conversational format with a text-based conversational agent (Woebot) (n=34) or were directed to the National Institute of Mental Health ebook, “Depression in College Students,” as an information-only control group (n=36). All participants completed Web-based versions of the 9-item Patient Health Questionnaire (PHQ-9), the 7-item Generalized Anxiety Disorder scale (GAD-7), and the Positive and Negative Affect Scale at baseline and 2-3 weeks later (T2).

**Results** Participants were on average 22.2 years old (SD 2.33), 67% female (47/70), mostly non-Hispanic (93%, 54/58), and Caucasian (79%, 46/58). Participants in the Woebot group engaged with the conversational agent an average of 12.14 (SD 2.23) times over the study period. No significant differences existed between the groups at baseline, and 83% (58/70) of participants provided data at T2 (17% attrition). Intent-to-treat univariate analysis of covariance revealed a significant group difference on depression such that those in the Woebot group significantly reduced their symptoms of depression over the study period as measured by the PHQ-9 (*F*=6.47; *P*=.01) while those in the information control group did not. In an analysis of completers, participants in both groups significantly reduced anxiety as measured by the GAD-7 (*F*~1,54~= 9.24; *P*=.004). Participants’ comments suggest that process factors were more influential on their acceptability of the program than content factors mirroring traditional therapy.

**Conclusions** Conversational agents appear to be a feasible, engaging, and effective way to deliver CBT.
:::

:::space{lines=1}

**Keywords** conversational agents; mobile mental health; mental health; chatbots; depression; anxiety; college students; digital health

**Trial registration** None. The trial involved a nonclinical population of college students and was considered exempt from registration in a public trials registry; it is reported with the CONSORT-EHEALTH checklist.
:::

## Introduction

Up to 74% of mental health diagnoses have their first onset before the age of 24 [@kessler2007]. Depression and anxiety symptoms are particularly common among college students, with more than half reporting symptoms of anxiety and depression in the previous year that were so severe they had difficulty functioning [@zivin2009]. In addition, epidemiological data suggest that mental health problems are both increasing in prevalence and severity [@hunt2010]. However, up to 75% of the college students that need them do not access clinical services [@hunt2010]. While the reasons for this are varied, the ubiquity of free or inexpensive mental health services on campuses suggests that service availability and cost are not primary barriers to care [@hunt2010]. Like non-college populations, stigma is considered the primary barrier to accessing psychological health services.

Overcoming problems of stigma has been traditionally considered a major benefit of Internet-delivered and more recently mobile mental health interventions. In recent years, there has been an explosion of interest and development of such services to either supplement existing mental health treatments or expand limited access to quality mental health services [@bakker2016]. This development is matched by great patient demand with about 70% showing interest in using mobile apps to self-monitor and self-manage their mental health [@torous2014]. Internet interventions for anxiety and depression have empirical support [@spek2007] with outcomes comparable to therapist-delivered cognitive behavioral therapy (CBT) [@barak2008; @andersson2009]. Yet, despite demonstrated efficacy, they are characterized by relatively poor adoption and adherence. One review found a median minimal completion rate of 56% [@donkin2013]. A hypothesized reason for this lack of adherence is the loss of the human interactional quality that in-person CBT retains.

With recent advancements in voice recognition, conversational interfaces (ie, those that use natural language as inputs and outputs) have begun to emerge. Conversational agents (such as Apple’s Siri or Amazon’s Alexa) may be a more natural medium through which individuals engage with technology. Humans respond and converse with nonhuman agents in ways that mirror emotional and social discourse dynamics when discussing behavioral health [@bickmore2005] and their capacity to act as first responders has already been evaluated [@miner2016]. Theoretically, conversational interfaces may be better positioned than visually oriented mobile apps to deliver structured, manualized therapies because in addition to delivering therapeutic content, they can mirror therapeutic process. Indeed, @bickmore2005 demonstrated that a carefully designed health-related conversational agent could establish a therapeutic relationship with adults attempting to increase exercise. The intervention was an embodied conversational agent, that is, it was designed with a graphical face to mirror human interactions that are typically face-to-face.

Thus, the objective of this study was to assess the feasibility of delivering CBT in a conversational interface via an automated bot in a way that facilitates engagement and reduction in symptoms. The current study compared outcomes from 2 weeks of a CBT-oriented conversational agent (Woebot), or an information control group (National Institute of Mental Health’s [NIMH] ebook) in a nonclinical college population. We hypothesized that conversation with a therapeutic process-oriented conversational agent would lead to greater improvement in symptoms relative to the information control group. We also hypothesized that receiving psychoeducational material in a conversational manner would be more acceptable to those who received it.

## Methods

### Recruitment and Procedure

Potential participants were recruited using a flyer posted on social media websites targeting a US university community for students who self-identified as experiencing symptoms of depression and anxiety. Inclusion criteria included age 18 and over (screened at the first level via checkbox confirmation) and able to read English (implied). To guard against compromise, for example from malicious bots, all potential participants were sent an email requesting that they respond denoting their confirmation. Confirmed participants were randomized via computer algorithm that automatically generated a number between 0 and 1. Participants with numbers <0.5 were allocated to receive a direct link to begin chatting with Woebot in an instant messenger app, and participants with numbers >0.5 were sent a link to NIMH’s ebook on depression among college students [@nimh2017], after completion of online baseline questionnaires. Because the randomization allocation occurred algorithmically, allocation concealment was in place. However, the condition to which each participant was allocated was not masked for the service providers (Woebot Labs). After approximately 2 weeks (T2), participants were contacted again to complete a second set of questionnaires online. Participants were offered a prorated incentive of US \$10 per completed assessment (US \$20 for completion of both assessments).

Since this trial involved a nonclinical population of college students, it was considered exempt from registration in a public trials registry. See Multimedia Appendix 1 for the study’s CONSORT-EHEALTH checklist [@eysenbach2011].

### Woebot

Woebot is an automated conversational agent designed to deliver CBT in the format of brief, daily conversations and mood tracking. Woebot is used within an instant messenger app that is platform agnostic and can be used either on a desktop or mobile device. Each interaction begins with a general inquiry about context (eg, “What’s going on in your world right now?”), and mood (eg, “How are you feeling?”) with responses provided as word or emoji images to represent affect in that moment. After gathering mood data, participants are presented with core concepts related to CBT by link to short video, or by way of short “word games” designed to facilitate teaching participants about cognitive distortions. The first day included an “onboarding” process that introduced the bot, adding that while the bot may seem like a person, it is closer to a “choose your own adventure self-help book” and therefore not fully capable of understanding what the needs of the user may be. The bot also briefly explained CBT and notified the user that while a psychologist was “keeping an eye on things” (ie, monitoring), this was not happening in real time and thus the service should not be used as a replacement for therapy. In addition, participants were encouraged to call 911 for emergencies.

The bot’s conversational style was modeled on human clinical decision making and the dynamics of social discourse. Psychoeducational content was adapted from self-help for CBT [@burns1980; @burns2006; @towery2016]. Aside from CBT content, the bot was created to include the following therapeutic process-oriented features:

- **Empathic responses:** The bot replied in an empathic way appropriate to the participants’ inputted mood.
- **Tailoring:** Specific content is sent to individuals depending on mood state. For example, a participant indicating that they feel anxious is offered in-vivo assistance with the anxious event.
- **Goal setting:** The conversational agent asked participants if they had a personal goal that they hoped to achieve over the 2-week period.
- **Accountability:** To facilitate a sense of accountability, the bot set expectations of regular check-ins and followed up on earlier activities, for example, on the status of the stated goal.
- **Motivation and engagement:** To engage the individual in daily monitoring, the bot sent one personalized message every day or every other day to initiate a conversation (ie, prompting).
- **Reflection:** The bot also provided weekly charts depicting each participant’s mood over time. Each graph was sent with a brief description of the data to facilitate reflection.

:::callout{type="chat" title="The bot’s messages quoted in the Methods"}
:::callout{type="bubble" title="Check-in · context"}
What’s going on in your world right now?
:::
:::callout{type="bubble" title="Check-in · mood"}
How are you feeling?
:::
:::callout{type="bubble" title="Empathic response · endorsed loneliness"}
I’m so sorry you’re feeling lonely. I guess we all feel a little lonely sometimes
:::
:::callout{type="bubble" title="Empathic response · excitement"}
Yay, always good to hear that!
:::
:::callout{type="bubble" title="Reflection · weekly mood chart"}
Overall, your mood has been fairly steady, though you tend to become tired after periods of anxiety. It looks like Tuesday was your best day.
:::
:::

### Information Control Condition

In the information control condition, participants were directed to the NIMH resources section and specifically, a free publication entitled “Depression in College Students” [@nimh2017].

### Measures

#### The Patient Health Questionnaire-9

The Patient Health Questionnaire (PHQ-9) [@kroenke2001] is a 9-item, self-report questionnaire that assesses the frequency and severity of depressive symptomatology within the previous 2 weeks. Each of the 9 items is based on the Diagnostic and Statistical Manual of Mental Disorders, 4th edition (DSM-IV) criteria for major depressive disorder and can be scored on a 0 (not at all) to 3 (nearly every day) scale.

#### Generalized Anxiety Disorder-7

The Generalized Anxiety Disorder 7-item scale (GAD-7) [@spitzer2006] is a valid, brief self-report tool to assess the frequency and severity of anxious thoughts and behaviors over the past 2 weeks. Based on the DSM-IV diagnostic criteria for GAD, the scores of all 7 items range from 0 (not at all) to 3 (nearly every day). Therefore, the total score ranges from 0-21.

#### Positive and Negative Affect Schedule

The Positive and Negative Affect Schedule (PANAS) [@watson1988] is a 20-item self-report measure of current positive and negative affect. Items are scored on a 1 (very slightly or not at all) to 5 (extremely) scale, with higher scores representing higher affect. Positive and negative affect are summed independent of each other with possible scores from 10-50.

### Statistical Analysis

Statistical power calculations using analysis of covariance (ANCOVA) revealed that a sample size of 70 would have sufficient (80%) power to detect a moderate-large effect size (Cohen *d*=0.4) for depression, reported by a meta-analysis of Internet-delivered treatments for adult depression and anxiety [@andersson2009], with alpha at 5%.

To determine whether any significant differences between groups existed at baseline, independent *t* tests were conducted on continuous baseline variables (eg, age, PHQ-9, GAD-7, and PANAS), and chi-square analyses were conducted on categorical or nominal variables (gender, race, ethnicity). Univariate effects of group membership on T2 outcomes were examined using between-subjects ANCOVA adjusting for baseline measures. Cohen *d* effect sizes were calculated to examine the magnitude of between-group differences. All subjects were included in intention-to-treat (ITT) analyses. Prior to conducting these analyses, the multiple imputation procedure in SPSS v. 23 was used to handle missing data assumed to be missing at random. As secondary subgroup analyses, we conducted completer analyses using 2x2 repeated measures analysis of variance (ANOVA) to explore main and interaction effects.

### Ethics and Informed Consent

The study was reviewed and approved by Stanford School of Medicine’s Institutional Review Board. Participants indicated their consent to the terms of the study via checkbox on an information sheet. As additional safety measures, participants in the Woebot group who denoted long-standing depression, suicidality, or self-harm were automatically provided with helpline numbers and a crisis text line number, and were encouraged to call 911 in emergencies.
