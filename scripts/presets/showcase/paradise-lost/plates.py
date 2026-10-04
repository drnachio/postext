"""Gustave Doré's fifty plates for *Paradise Lost* (Cassell, 1866), in the
order of the poem: the Commons file, the book and lines each one illustrates
and the quotation printed under it in the 1866 edition (checked by build.py
against the text of the poem). `title` is the plate's usual English name,
used for the alt text and the list of plates."""
from __future__ import annotations

# (commons file, book, first line, last line, quotation, title)
_PLATES = [
    ("Paradise Lost 1.jpg", 1, 44, 45, "Him the almighty Power / Hurled headlong flaming from the ethereal sky", "The fall of the rebel angels"),
    ("Paradise Lost 2.jpg", 1, 221, 222, "Forthwith upright he rears from off the pool / His mighty stature", "Satan rises from the burning lake"),
    ("Paradise Lost 3.jpg", 1, 331, 331, "They heard, and were abashed, and up they sprung", "Satan rouses his legions"),
    ("Paradise Lost 4.jpg", 1, 344, 345, "So numberless were those bad Angels seen / Hovering on wing under the cope of Hell", "The fallen angels on the wing"),
    ("Paradise Lost 5.jpg", 1, 757, 759, "Their summons called, / From every band and squared regiment, / By place or choice the worthiest", "The council summoned to Pandemonium"),
    ("Paradise Lost 6.jpg", 2, 1, 2, "High on a throne of royal state, which far / Outshone the wealth of Ormus and of Ind", "Satan enthroned"),
    ("Paradise Lost 7.jpg", 2, 628, 628, "Gorgons, and Hydras, and Chimeras dire", "The fallen angels explore Hell"),
    ("Paradise Lost 8.jpg", 2, 648, 649, "Before the gates there sat / On either side a formidable Shape", "Satan meets Sin and Death"),
    ("Paradise Lost 9.jpg", 2, 949, 950, "With head, hands, wings, or feet, pursues his way, / And swims, or sinks, or wades, or creeps, or flies", "Satan’s journey through Chaos"),
    ("Paradise Lost 10.jpg", 3, 347, 349, "Heaven rung / With jubilee, and loud Hosannas filled / The eternal regions", "The Son and the hosts of Heaven"),
    ("Paradise Lost 11.jpg", 3, 473, 474, "And many more too long, / Embryos and idiots, eremites and friars", "The Paradise of Fools"),
    ("Paradise Lost 12.jpg", 3, 739, 741, "Toward the coast of Earth beneath, / Down from the ecliptic, sped with hoped success, / Throws his steep flight in many an aery wheel", "Satan flies down to the Earth"),
    ("Paradise Lost 13.jpg", 4, 73, 74, "Me miserable! which way shall I fly / Infinite wrath and infinite despair?", "Satan’s despair"),
    ("Paradise Lost 14.jpg", 4, 172, 173, "Now to the ascent of that steep savage hill / Satan had journeyed on, pensive and slow", "Satan above Eden"),
    ("Paradise Lost 15.jpg", 4, 247, 247, "A happy rural seat of various view", "Satan surveys the Garden"),
    ("Paradise Lost 16.jpg", 4, 335, 336, "The savoury pulp they chew, and in the rind, / Still as they thirsted, scoop the brimming stream", "Adam and Eve in the Garden"),
    ("Paradise Lost 17.jpg", 4, 589, 590, "So promised he; and Uriel to his charge / Returned", "Gabriel at the gate of Eden"),
    ("Paradise Lost 18.jpg", 4, 798, 799, "These to the bower direct / In search of whom they sought", "Ithuriel and Zephon"),
    ("Paradise Lost 19.jpg", 4, 1014, 1015, "Nor more; but fled / Murmuring, and with him fled the shades of night", "Satan flees Gabriel"),
    ("Paradise Lost 20.jpg", 5, 12, 13, "Leaning half-raised, with looks of cordial love / Hung over her enamoured", "Adam wakes Eve"),
    ("Paradise Lost 21.jpg", 5, 309, 310, "Eastward among those trees, what glorious shape / Comes this way moving", "Raphael comes to the Garden"),
    ("5-468 To whom the winged Hierarch replied.jpg", 5, 468, 470, "To whom the winged Hierarch replied: / O Adam, one Almighty is, from whom / All things proceed", "Raphael instructs Adam and Eve"),
    ("6-188 This greeting on thy impious crest.jpg", 6, 188, 188, "This greeting on thy impious crest receive", "Abdiel strikes Satan"),
    ("6-207 Now storming fury rose.jpg", 6, 207, 209, "Now storming fury rose, / And clamour such as heard in Heaven till now / Was never", "The war in Heaven"),
    ("Paradise Lost 25.jpg", 6, 327, 328, "Then Satan first knew pain, / And writhed him to and fro", "Satan wounded"),
    ("6-406 Now night her course began.jpg", 6, 406, 406, "Now Night her course began", "Night on the field of battle"),
    ("Paradise Lost 27.jpg", 6, 410, 412, "On the foughten field / Michaël and his Angels, prevalent / Encamping, placed in guard their watches round", "Michael’s angels keep watch"),
    ("Paradise Lost 28.jpg", 6, 871, 871, "Nine days they fell", "The rebel angels cast out"),
    ("Paradise Lost 29.jpg", 6, 874, 875, "Hell at last, / Yawning, received them whole", "The fall into Hell"),
    ("Paradise Lost 30.jpg", 7, 298, 299, "Wave rolling after wave, where way they found, / If steep, with torrent rapture", "The waters gathered"),
    ("Paradise Lost 31.jpg", 7, 387, 389, "And God said, Let the waters generate / Reptile with spawn abundant, living soul; / And let fowl fly above the earth", "The creation of the fish and the fowl"),
    ("Paradise Lost 32.jpg", 7, 415, 416, "And seems a moving land, and at his gills / Draws in, and at his trunk spouts out, a sea", "Leviathan"),
    ("Paradise Lost 33.jpg", 7, 417, 418, "Meanwhile the tepid caves, and fens, and shores, / Their brood as numerous hatch", "The birds hatched"),
    ("Paradise Lost 34.jpg", 7, 581, 582, "And now on Earth the seventh / Evening arose in Eden", "The evening of the seventh day"),
    ("Paradise Lost 35.jpg", 8, 652, 653, "So parted they, the Angel up to Heaven / From the thick shade, and Adam to his bower", "Raphael takes his leave"),
    ("Paradise Lost 36.jpg", 9, 74, 75, "In with the river sunk, and with it rose / Satan", "Satan returns with the river"),
    ("Paradise Lost 37.jpg", 9, 99, 100, "O Earth, how like to Heaven, if not preferred / More justly", "Satan’s soliloquy"),
    ("Paradise Lost 38.jpg", 9, 182, 183, "Him fast sleeping soon he found, / In labyrinth of many a round self-rolled", "Satan finds the serpent"),
    ("Paradise Lost 39.jpg", 9, 434, 435, "Nearer he drew, and many a walk traversed / Of stateliest covert, cedar, pine, or palm", "The serpent draws near Eve"),
    ("Paradise Lost 40.jpg", 9, 784, 785, "Back to the thicket slunk / The guilty Serpent", "Eve eats the fruit"),
    ("Paradise Lost 41.jpg", 9, 1121, 1123, "Nor only tears / Rained at their eyes, but high winds worse within / Began to rise", "Adam and Eve after the Fall"),
    ("Paradise Lost 42.jpg", 10, 99, 101, "They heard, / And from his presence hid themselves among / The thickest trees", "Adam and Eve hide"),
    ("Paradise Lost 43.jpg", 10, 439, 441, "And now expecting / Each hour their great Adventurer from the search / Of foreign worlds", "The fallen angels await Satan"),
    ("Paradise Lost 44.jpg", 10, 521, 523, "Dreadful was the din / Of hissing through the hall, thick-swarming now / With complicated monsters", "The fallen angels turned to serpents"),
    ("Paradise Lost 45.jpg", 10, 610, 610, "This said, they both betook them several ways", "Sin and Death set out"),
    ("Paradise Lost 46.jpg", 11, 208, 210, "The heavenly bands / Down from a sky of jasper lighted now / In Paradise", "Michael’s band descends"),
    ("Paradise Lost 47.jpg", 11, 729, 729, "Began to build a vessel of huge bulk", "The building of the Ark"),
    ("Paradise Lost 48.jpg", 11, 747, 749, "All dwellings else / Flood overwhelmed, and them with all their pomp / Deep under water rolled", "The Flood"),
    ("Paradise Lost 49.jpg", 12, 236, 238, "They beseech / That Moses might report to them his will, / And terror cease", "Moses with the tables of the Law"),
    ("Paradise Lost 50.jpg", 12, 645, 645, "Some natural tears they dropped, but wiped them soon", "The expulsion from Eden"),
]

PLATES = [
    {"slug": f"plate-{i + 1:02d}", "commons": c, "book": b, "first": f, "last": l, "quote": q, "title": t}
    for i, (c, b, f, l, q, t) in enumerate(_PLATES)
]
