# Methods {style="methods"}

### IPA

The IPA module combines the pair representation, the single representation and the geometric representation to update the single representation (Supplementary Fig. 8). Each of these representations contributes affinities to the shared attention weights and then uses these weights to map its values to the output. The IPA operates in 3D space. Each residue produces query points, key points and value points in its local frame. These points are projected into the global frame using the backbone frame of the residue in which they interact with each other. The resulting points are then projected back into the local frame. The affinity computation in the 3D space uses squared distances and the coordinate transformations ensure the invariance of this module with respect to the global frame (see Supplementary Methods 1.8.2 ‘Invariant point attention (IPA)’ for the algorithm, proof of invariance and a description of the full multi-head version).

### Inputs and data sources

Inputs to the network are the primary sequence, sequences from evolutionarily related proteins in the form of a MSA created by standard tools including jackhmmer[@johnson2010] and HHBlits[@remmert2012], and 3D atom coordinates of a small number of homologous structures (templates) where available. For both the MSA and templates, the search processes are tuned for high recall; spurious matches will probably appear in the raw MSA but this matches the training condition of the network.

For MSA search on BFD + Uniclust30, and template search against PDB70, we used HHBlits[@remmert2012] and HHSearch[@steinegger2019b] from hh-suite v.3.0-beta.3 (version 14/07/2017). For MSA search on Uniref90 and clustered MGnify, we used jackhmmer from HMMER3[@eddy2011]. For constrained relaxation of structures, we used OpenMM v.7.3.1[@eastman2017] with the Amber99sb force field[@hornak2006]. For neural network construction, running and other analyses, we used TensorFlow[@ashish2015], Sonnet[@reynolds2017], NumPy[@harris2020], Python[@vanrossum2009] and Colab[@bisong2019].

### Inference regimen

Using our CASP14 configuration for AlphaFold, the trunk of the network is run multiple times with different random choices for the MSA cluster centres (see Supplementary Methods 1.11.2 for details of the ensembling procedure). The full time to make a structure prediction varies considerably depending on the length of the protein. Representative timings for the neural network using a single model on V100 GPU are 4.8 min with 256 residues, 9.2 min with 384 residues and 18 h at 2,500 residues. These timings are measured using our open-source code, and the open-source code is notably faster than the version we ran in CASP14 as we now use the XLA compiler[@xla2018].

Since CASP14, we have found that the accuracy of the network without ensembling is very close or equal to the accuracy with ensembling and we turn off ensembling for most inference. Without ensembling, the network is 8× faster and the representative timings for a single model are 0.6 min with 256 residues, 1.1 min with 384 residues and 2.1 h with 2,500 residues.

::resource{id="tbl-timings"}

### Metrics

The predicted structure is compared to the true structure from the PDB in terms of lDDT metric[@mariani2013], as this metric reports the domain accuracy without requiring a domain segmentation of chain structures. The distances are either computed between all heavy atoms (lDDT) or only the Cα atoms to measure the backbone accuracy (lDDT-Cα). As lDDT-Cα only focuses on the Cα atoms, it does not include the penalty for structural violations and clashes. Domain accuracies in CASP are reported as GDT[@zemla2003] and the TM-score[@zhang2004] is used as a full chain global superposition metric.

We also report accuracies using the r.m.s.d.~95~ (Cα r.m.s.d. at 95% coverage). We perform five iterations of (1) a least-squares alignment of the predicted structure and the PDB structure on the currently chosen Cα atoms (using all Cα atoms in the first iteration); (2) selecting the 95% of Cα atoms with the lowest alignment error. The r.m.s.d. of the atoms chosen for the final iterations is the r.m.s.d.~95~. This metric is more robust to apparent errors that can originate from crystal structure artefacts, although in some cases the removed 5% of residues will contain genuine modelling errors.

### Data availability

All input data are freely available from public sources. We show experimental structures from the PDB with accession numbers 6Y4F[@jiang2020], 6YJ1[@dunne2020], 6VR4[@drobysheva2021], 6SK0[@flaugnatti2020], 6FES[@elgamacy2018], 6W6W[@lim2020], 6T1Z[@debruycker2020] and 7JTL[@flower2021].

### Code availability

Source code for the AlphaFold model, trained weights and inference script are available under an open-source license at https://github.com/deepmind/alphafold.
