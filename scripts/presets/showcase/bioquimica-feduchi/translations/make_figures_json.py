#!/usr/bin/env python3
"""Write `figures.json` from the readable table below.

The build reads `figures.json` — for each picture, the run index of every
label it replaces. Indices are no use to a translator and change whenever the
cut is tuned, so the wording lives here instead, keyed by the Spanish it
replaces, and this script resolves the indices against the current cut:

    python3 scripts/presets/showcase/bioquimica-feduchi/build.py --labels
    python3 scripts/presets/showcase/bioquimica-feduchi/translations/make_figures_json.py

Each row is `(spanish, english)`, or `(spanish, english, options)` for the
labels that need more than new words. The rows of a picture are matched in
order, so the same Spanish word may appear as often as the picture sets it.
An English of `None` keeps the run's own characters — for a superscript that
only has to move.

The options are those `figures.apply_translation` takes — `anchor`, `was`,
`dx`, `dy`, `cover` — plus `{"stack": True}`, for a word the page tracks or
stacks across several runs, which is re-set letter by letter, and
`{"follows": "previous"}`, which hangs a run on the row before it so a
superscript keeps its place against a word that changed length.
"""
from __future__ import annotations

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

#: picture → the labels it sets, in the order the cut reports them.
LABELS: dict[str, list[tuple]] = {
    "fig-1-1": [
        ("A: Número másico: es la suma de ", "A: Mass number: the sum of "),
        ("neutrones y protones", "neutrons and protons"),
        ("Z: Número atómico = Nº de protones", "Z: Atomic number = no. of protons"),
        ("A: Número másico", "A: Mass number"),
        ("Z: Número atómico", "Z: Atomic number"),
        ("Número másico", "Mass number"),
        ("Número atómico", "Atomic number"),
    ],
    # Each level number is set apart from its label, so it closes back up
    # against the shorter English.
    "fig-1-2": [
        ("Nivel de energía ", "Energy level "),
        ("2", None, {"follows": "previous"}),
        ("Nivel de energía ", "Energy level "),
        ("1", None, {"follows": "previous"}),
        ("Nitrógeno,", "Nitrogen,"),
        ("Nivel de energía ", "Energy level "),
        ("2", None, {"follows": "previous"}),
        ("Nivel de energía ", "Energy level "),
        ("1", None, {"follows": "previous"}),
        ("Oxígeno,", "Oxygen,"),
    ],
    # The caption is two centred lines the page tracks word by word; each
    # line is taken over by its first run and re-centred on the original.
    "fig-1-3": [
        ("0,9 ", "0.9 "),
        ("Trazas", "Traces"),
        ("% del ", "% of the total number of atoms", {"anchor": "middle", "was": "% del número total de átomos presentes"}),
        ("número ", ""),
        ("total ", ""),
        ("de átomos ", ""),
        ("presentes", ""),
        ("en el ", "present in the human body", {"anchor": "middle", "was": "en el cuerpo humano"}),
        ("cuerpo ", ""),
        ("humano", ""),
    ],
    "fig-1-5": [
        ("Átomos", "Atoms"),
        ("Átomos", "Atoms"),
        ("Electrones", "Shared"),
        ("compartidos", "electrons"),
        ("Transferencia", "Electron"),
        ("de electrones", "transfer"),
        ("Molécula", "Molecule"),
        ("ion", "positive"),
        ("positivo", "ion"),
        ("ion", "negative"),
        ("negativo", "ion"),
        ("Enlace covalente", "Covalent bond"),
        ("Enlace iónico", "Ionic bond"),
    ],
    "fig-1-6": [
        ("Carbono", "Carbon"),
        ("promoción", "promotion"),
        ("hibridación", "hybridisation"),
        ("hibridación", "hybridisation"),
    ],
    "fig-1-7": [
        ("Electrones forman", "Electrons form a"),
        ("enlace coordinado", "coordinate bond"),
        ("con el protón", "with the proton"),
        ("ion amonio", "ammonium ion"),
    ],
    "fig-1-8": [
        ("Diferencia de electronegatividad", "Electronegativity difference"),
        ("enlace covalente apolar", "non-polar covalent bond"),
        ("enlace covalente polar", "polar covalent bond"),
        ("enlace iónico", "ionic bond"),
    ],
    "fig-1-9": [
        ("Puente de hidrógeno", "Hydrogen bond"),
        ("carbonilo", "carbonyl"),
        ("carbonilo", "carbonyl"),
        ("amino", "amino"),
        ("amino", "amino"),
        ("hidroxilo", "hydroxyl"),
        ("amino", "amino"),
        ("Aceptor de", "H-bond"),
        ("puente de H", "acceptor"),
        ("Donador de", "H-bond"),
        ("puente de H", "donor"),
        ("Enlace covalente", "Covalent bond"),
    ],
    # "ion Na⁺ / hidratado" becomes "Na⁺ / hydrated ion": each line keeps its
    # own centre and the superscript follows the symbol it sits on.
    "fig-1-10": [
        ("ion Na", "Na", {"anchor": "middle"}),
        ("+", None, {"follows": "previous"}),
        ("hidratado", "hydrated ion", {"anchor": "middle"}),
        ("ion Cl", "Cl", {"anchor": "middle"}),
        ("-", None, {"follows": "previous"}),
        ("hidratado", "hydrated ion", {"anchor": "middle"}),
    ],
    "fig-1-12": [
        ("104,5º", "104.5º"),
    ],
    "fig-1-13": [
        ("El protón se desplaza", "The proton moves"),
        ("de una molécula a otra", "from one molecule to another"),
        ("ion hidronio", "hydronium ion"),
        ("hidroxilo", "hydroxyl"),
    ],
    "fig-1-14": [
        ("Grupo carboxilo", "Carboxyl group"),
        ("(ácido)", "(acid)"),
        ("Agua", "Water"),
        ("(base)", "(base)"),
        ("Grupo carboxilato", "Carboxylate group"),
        ("(base conjugada)", "(conjugate base)"),
        ("Hidronio", "Hydronium"),
        ("(ácido conjugado)", "(conjugate acid)"),
    ],
    "fig-1-15": [
        ("Nucleófilos", "Nucleophiles"),
        ("Electrófilos", "Electrophiles"),
        ("Grupo amino", "Uncharged"),
        ("no cargado", "amino group"),
        ("Átomo de carbono", "Carbon atom of a"),
        ("de un grupo carbonilo", "carbonyl group"),
        ("Protón", "Proton"),
        ("Ion hidróxido", "Hydroxide ion"),
    ],
    "fig-1-16": [
        ("Tipo de enlace", "Type of bond"),
        ("-glucosídico", "-glycosidic"),
        ("Enlace ", "Peptide bond (amide)", {"anchor": "middle", "was": "Enlace peptídico (amida)"}),
        ("peptídico ", ""),
        ("(amida)", ""),
        ("Enlace ", "Phosphodiester bond", {"anchor": "middle", "was": "Enlace fosfodiéster"}),
        ("fosfodiéster", ""),
    ],
    # The two arrows set their word one letter per run, down the page.
    "fig-1-17": [
        ("Metilo", "Methyl"),
        ("Hidroxilo", "Hydroxyl"),
        ("Carbonilo", "Carbonyl"),
        ("Carboxilo", "Carboxyl"),
        ("Dióxido de", "Carbon"),
        ("carbono", "dioxide"),
        ("REDUCCIÓN", "REDUCTION", {"stack": True}),
        ("OXIDACIÓN", "OXIDATION", {"stack": True}),
    ],
    "fig-1-18": [
        ("Proteína", "Protein"),
    ],
    "recuadro-1-1-tabla-1": [
        ("Átomo", "Atom"),
        ("Número de ", "Number of "),
        ("electrones ", "unpaired "),
        ("no apareados ", "electrons "),
        ("(en rojo)", "(in red)"),
        ("Número de ", "Number of "),
        ("electrones en ", "electrons in "),
        ("la capa externa ", "the complete "),
        ("completa", "outer shell"),
        ("Dihidrógeno", "Dihydrogen"),
        ("Agua", "Water"),
        ("Amoníaco", "Ammonia"),
        ("Metano", "Methane"),
        ("Sulfuro de ", "Hydrogen "),
        ("hidrógeno", "sulphide"),
        ("Ácido ", "Phosphoric "),
        ("fosfórico", "acid"),
    ],
    "recuadro-1-2-tabla-2": [
        ("COMPUESTOS CON HIDRÓGENO", "HYDROGEN COMPOUNDS"),
        ("Grupo funcional", "Functional group"),
        ("Estructura", "Structure"),
        ("Fórmula", "Formula"),
        ("Naturaleza ", "Chemical "),
        ("química ", "nature "),
        ("Alifático", "Aliphatic"),
        ("No polar", "Non-polar"),
        ("Alcano", "Alkane"),
        ("Metilo", "Methyl"),
        ("Etilo", "Ethyl"),
        ("Alqueno", "Alkene"),
        ("Eteno ", "Ethene "),
        ("(etileno)", "(ethylene)"),
        ("No polar", "Non-polar"),
        ("Aromático", "Aromatic"),
        ("No polar", "Non-polar"),
        ("Fenilo", "Phenyl"),
    ],
    "recuadro-1-2-tabla-3": [
        ("COMPUESTOS CON OXÍGENO", "OXYGEN COMPOUNDS"),
        ("Grupo funcional", "Functional group"),
        ("Estructura", "Structure"),
        ("Fórmula", "Formula"),
        ("Naturaleza ", "Chemical "),
        ("química ", "nature "),
        ("Hidroxilo (alcohol)", "Hydroxyl (alcohol)"),
        ("Polar", "Polar"),
        ("Carbonilo", "Carbonyl"),
        ("Aldehído ", "Aldehyde "),
        ("C primario", "primary C"),
        ("Polar", "Polar"),
        ("Cetona  ", "Ketone  "),
        ("C ", "secondary C"),
        ("secunda", ""),
        ("rio", ""),
        ("Polar", "Polar"),
        ("Carboxilo", "Carboxyl"),
        ("Polar ", "Polar "),
        ("(ácido)", "(acid)"),
        ("Éster", "Ester"),
        ("No polar", "Non-polar"),
    ],
    "recuadro-1-2-tabla-4": [
        ("COMPUESTOS CON NITRÓGENO", "NITROGEN COMPOUNDS"),
        ("Grupo funcional", "Functional group"),
        ("Estructura", "Structure"),
        ("Fórmula", "Formula"),
        ("Naturaleza ", "Chemical "),
        ("química ", "nature "),
        ("Amino", "Amino"),
        ("Primaria", "Primary"),
        ("Polar (base)", "Polar (base)"),
        ("Secundari", "Secondary"),
        ("a", ""),
        ("Polar (base)", "Polar (base)"),
        ("Imino", "Imino"),
        ("Polar (base)", "Polar (base)"),
        ("Amido", "Amido"),
        ("Polar", "Polar"),
    ],
    "recuadro-1-2-tabla-5": [
        ("COMPUESTOS CON FÓSFORO", "PHOSPHORUS COMPOUNDS"),
        ("Grupo ", "Functional "),
        ("funcional", "group"),
        ("Estructura", "Structure"),
        ("Fórmula", "Formula"),
        ("Naturaleza ", "Chemical "),
        ("química ", "nature "),
        ("Fosforilo", "Phosphoryl"),
        ("Polar (ácido)", "Polar (acid)"),
    ],
    "recuadro-1-2-tabla-6": [
        ("COMPUESTOS CON AZUFRE ", "SULPHUR COMPOUNDS "),
        ("Grupo ", "Functional "),
        ("funcional", "group"),
        ("Estructura", "Structure"),
        ("Fórmula", "Formula"),
        ("Naturaleza ", "Chemical "),
        ("química ", "nature "),
        ("Sulfhidrilo ", "Sulfhydryl "),
        ("(tiol)", "(thiol)"),
        ("Polar", "Polar"),
        ("Sulfurilo ", "Sulfuryl "),
        ("(ác. sulfúrico)", "(sulfuric acid)"),
        ("Polar (ácido)", "Polar (acid)"),
    ],
    "recuadro-1-3-tabla-1": [
        ("PUENTE DE HIDRÓGENO", "HYDROGEN BOND"),
        ("INTERACCIÓN HIDROFÓBICA", "HYDROPHOBIC INTERACTION"),
        ("Hidroxilo", "Hydroxyl"),
        ("Alifáticos ", "Aliphatic "),
        ("Aromáticos", "Aromatic"),
        ("Carbonilo", "Carbonyl"),
        ("Carboxilo", "Carboxyl"),
        ("(cualquier ", "(any "),
        ("ácido ", "protonated "),
        ("protonado)", "acid)"),
        ("PUENTE SALINO", "SALT BRIDGE"),
        ("Amino", "Amino"),
        ("Amido", "Amido"),
    ],
    "recuadro-1-6-fig": [
        ("pH 5,76", "pH 5.76"),
        ("región tamponante", "buffering region"),
        ("pH 3,76", "pH 3.76"),
        ("0,1", "0.1"),
        ("0,2", "0.2"),
        ("0,3", "0.3"),
        ("0,4", "0.4"),
        ("0,5", "0.5"),
        ("0,6", "0.6"),
        ("0,7", "0.7"),
        ("0,8", "0.8"),
        ("0,9", "0.9"),
        ("1,0", "1.0"),
        ("(equivalentes)", "(equivalents)"),
        (" = 4,76", " = 4.76"),
        ("Curva de titulación ", "Titration curve of "),
        ("del ácido acético", "acetic acid"),
    ],
    "recuadro-1-8-tabla-1": [
        ("NOMBRE", "NAME"),
        ("GRUPOS ", "FUNCTIONAL GROUPS", {"anchor": "middle", "was": "GRUPOS FUNCIONALES"}),
        ("FUNCIONALES", ""),
        ("REACCIÓN", "REACTION"),
        ("Éter", "Ether"),
        ("Hidroxilo", "Hydroxyl"),
        ("Hidroxilo", "Hydroxyl"),
        ("Éster", "Ester"),
        ("Carboxilo", "Carboxyl"),
        ("Hidroxilo", "Hydroxyl"),
        ("Sulfhidrilo", "Sulfhydryl"),
        (" tioéster", " thioester"),
        ("Éster fosfórico ", "Phosphoric ester "),
        ("Fosforilo", "Phosphoryl"),
        ("Hidroxilo", "Hydroxyl"),
        ("Éster sulfúrico", "Sulfuric ester"),
        ("Sulfurilo", "Sulfuryl"),
        ("Hidroxilo", "Hydroxyl"),
        ("Anhídridos", "Anhydrides"),
        ("Carboxilo", "Carboxyl"),
        ("Carboxilo", "Carboxyl"),
        ("Mixto", "Mixed"),
        ("Carboxilo", "Carboxyl"),
        ("Fosforilo", "Phosphoryl"),
        ("Fosfoanhídrido", "Phosphoanhydride"),
        ("Fosforilo", "Phosphoryl"),
        ("Fosforilo", "Phosphoryl"),
        ("Amida", "Amide"),
        ("Carboxilo", "Carboxyl"),
        ("Amina", "Amine"),
        ("Glucosídico", "Glycosidic"),
        (" anomérico", " (anomeric)"),
        ("Hidroxilo", "Hydroxyl"),
        ("anomérico", "(anomeric)"),
        ("Amina", "Amine"),
        ("Disulfuro", "Disulfide"),
        ("Sulfhidrilo", "Sulfhydryl"),
        ("Sulfhidrilo", "Sulfhydryl"),
        ("Todas ", "Every reaction is a condensation except the disulfide."),
        ("las reacciones son de condensación a excepción ", ""),
        ("del disulfuro.", ""),
        ("Se ha omitido la molécula de agua resultado de cada reacción ", "The water molecule each condensation yields has been left out."),
        ("de condensación.", ""),
    ],
    # The strip tracks its four words wide apart.
    "strip-resources": [
        ("ACTIVIDADES", "ACTIVITIES", {"stack": True}),
        ("FAQs", "FAQs", {"stack": True}),
        ("VÍDEOS", "VIDEOS", {"stack": True}),
        ("AUTOEVALUACIÓN", "SELF-ASSESSMENT", {"stack": True}),
    ],
}


def resolve(runs: list[str], rows: list[tuple], rid: str) -> dict[str, dict]:
    """Rows → entries by run index, matching each row's Spanish against the
    runs in order."""
    flat = [''.join(c for c in r if not c.isspace()) for r in runs]
    out: dict[str, dict] = {}
    at = 0
    for row in rows:
        spanish, english = row[0], row[1]
        options = dict(row[2]) if len(row) > 2 and row[2] else {}
        want = ''.join(c for c in spanish if not c.isspace())
        stack = options.pop('stack', False)
        if options.get('follows') == 'previous':
            if not out:
                raise SystemExit(f'{rid}: {spanish!r} follows nothing')
            options['follows'] = int(list(out)[-1])
        found = None
        for i in range(at, len(flat)):
            if not stack:
                if flat[i] == want:
                    found, span = i, 1
                    break
                continue
            joined = ''
            for j in range(i, len(flat)):
                joined += flat[j]
                if joined == want:
                    found, span = i, j - i + 1
                    break
                if not want.startswith(joined):
                    break
            if found is not None:
                break
        if found is None:
            raise SystemExit(f'{rid}: no run left matching {spanish!r} (from index {at})')
        entry = {'stack': english, 'runs': span} if stack else ({} if english is None else {'en': english})
        out[str(found)] = entry | options
        at = found + span
    return out


def main() -> None:
    worklist = os.path.join(HERE, 'figures.todo.json')
    if not os.path.exists(worklist):
        raise SystemExit('run `build.py --labels` first')
    runs = json.load(open(worklist, encoding='utf-8'))
    out = {}
    for rid, rows in LABELS.items():
        if rid not in runs:
            raise SystemExit(f'{rid}: no such picture in {worklist}')
        texts = [runs[rid][str(i)]['es'] for i in range(len(runs[rid]))]
        out[rid] = resolve(texts, rows, rid)
    path = os.path.join(HERE, 'figures.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'wrote {path}  ({len(out)} pictures, {sum(len(v) for v in out.values())} labels)')


if __name__ == '__main__':
    main()
