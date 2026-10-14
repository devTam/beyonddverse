import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const canon: Array<[string, number, "Old Testament" | "New Testament"]> = [
  ["Genesis",50,"Old Testament"],["Exodus",40,"Old Testament"],["Leviticus",27,"Old Testament"],["Numbers",36,"Old Testament"],["Deuteronomy",34,"Old Testament"],
  ["Joshua",24,"Old Testament"],["Judges",21,"Old Testament"],["Ruth",4,"Old Testament"],["1 Samuel",31,"Old Testament"],["2 Samuel",24,"Old Testament"],
  ["1 Kings",22,"Old Testament"],["2 Kings",25,"Old Testament"],["1 Chronicles",29,"Old Testament"],["2 Chronicles",36,"Old Testament"],["Ezra",10,"Old Testament"],
  ["Nehemiah",13,"Old Testament"],["Esther",10,"Old Testament"],["Job",42,"Old Testament"],["Psalms",150,"Old Testament"],["Proverbs",31,"Old Testament"],
  ["Ecclesiastes",12,"Old Testament"],["Song of Solomon",8,"Old Testament"],["Isaiah",66,"Old Testament"],["Jeremiah",52,"Old Testament"],["Lamentations",5,"Old Testament"],
  ["Ezekiel",48,"Old Testament"],["Daniel",12,"Old Testament"],["Hosea",14,"Old Testament"],["Joel",3,"Old Testament"],["Amos",9,"Old Testament"],
  ["Obadiah",1,"Old Testament"],["Jonah",4,"Old Testament"],["Micah",7,"Old Testament"],["Nahum",3,"Old Testament"],["Habakkuk",3,"Old Testament"],
  ["Zephaniah",3,"Old Testament"],["Haggai",2,"Old Testament"],["Zechariah",14,"Old Testament"],["Malachi",4,"Old Testament"],["Matthew",28,"New Testament"],
  ["Mark",16,"New Testament"],["Luke",24,"New Testament"],["John",21,"New Testament"],["Acts",28,"New Testament"],["Romans",16,"New Testament"],
  ["1 Corinthians",16,"New Testament"],["2 Corinthians",13,"New Testament"],["Galatians",6,"New Testament"],["Ephesians",6,"New Testament"],["Philippians",4,"New Testament"],
  ["Colossians",4,"New Testament"],["1 Thessalonians",5,"New Testament"],["2 Thessalonians",3,"New Testament"],["1 Timothy",6,"New Testament"],["2 Timothy",4,"New Testament"],
  ["Titus",3,"New Testament"],["Philemon",1,"New Testament"],["Hebrews",13,"New Testament"],["James",5,"New Testament"],["1 Peter",5,"New Testament"],
  ["2 Peter",3,"New Testament"],["1 John",5,"New Testament"],["2 John",1,"New Testament"],["3 John",1,"New Testament"],["Jude",1,"New Testament"],["Revelation",22,"New Testament"],
];

const genesisOne = [
  "In the beginning, God created the heavens and the earth.",
  "The earth was formless and empty. Darkness was on the surface of the deep and God’s Spirit was hovering over the surface of the waters.",
  "God said, “Let there be light,” and there was light.",
  "God saw the light, and saw that it was good. God divided the light from the darkness.",
  "God called the light “day”, and the darkness he called “night”. There was evening and there was morning, the first day.",
  "God said, “Let there be an expanse in the middle of the waters, and let it divide the waters from the waters.”",
  "God made the expanse, and divided the waters which were under the expanse from the waters which were above the expanse; and it was so.",
  "God called the expanse “sky”. There was evening and there was morning, a second day.",
  "God said, “Let the waters under the sky be gathered together to one place, and let the dry land appear”; and it was so.",
  "God called the dry land “earth”, and the gathering together of the waters he called “seas”. God saw that it was good.",
  "God said, “Let the earth yield grass, herbs yielding seeds, and fruit trees bearing fruit after their kind, with their seeds in it, on the earth”; and it was so.",
  "The earth yielded grass, herbs yielding seed after their kind, and trees bearing fruit, with their seeds in it, after their kind; and God saw that it was good.",
  "There was evening and there was morning, a third day.",
  "God said, “Let there be lights in the expanse of the sky to divide the day from the night; and let them be for signs to mark seasons, days, and years;",
  "and let them be for lights in the expanse of the sky to give light on the earth”; and it was so.",
  "God made the two great lights: the greater light to rule the day, and the lesser light to rule the night. He also made the stars.",
  "God set them in the expanse of the sky to give light to the earth,",
  "and to rule over the day and over the night, and to divide the light from the darkness. God saw that it was good.",
  "There was evening and there was morning, a fourth day.",
  "God said, “Let the waters abound with living creatures, and let birds fly above the earth in the open expanse of the sky.”",
  "God created the large sea creatures and every living creature that moves, with which the waters abounded, after their kind, and every winged bird after its kind. God saw that it was good.",
  "God blessed them, saying, “Be fruitful, multiply, and fill the waters in the seas, and let birds multiply on the earth.”",
  "There was evening and there was morning, a fifth day.",
  "God said, “Let the earth produce living creatures after their kind, livestock, creeping things, and animals of the earth after their kind”; and it was so.",
  "God made the animals of the earth after their kind, and the livestock after their kind, and everything that creeps on the ground after its kind. God saw that it was good.",
  "God said, “Let’s make man in our image, after our likeness. Let them have dominion over the fish of the sea, and over the birds of the sky, and over the livestock, and over all the earth, and over every creeping thing that creeps on the earth.”",
  "God created man in his own image. In God’s image he created him; male and female he created them.",
  "God blessed them. God said to them, “Be fruitful, multiply, fill the earth, and subdue it. Have dominion over the fish of the sea, over the birds of the sky, and over every living thing that moves on the earth.”",
  "God said, “Behold, I have given you every herb yielding seed, which is on the surface of all the earth, and every tree, which bears fruit yielding seed. It will be your food.",
  "To every animal of the earth, and to every bird of the sky, and to everything that creeps on the earth, in which there is life, I have given every green herb for food”; and it was so.",
  "God saw everything that he had made, and, behold, it was very good. There was evening and there was morning, a sixth day.",
];

async function main() {
  const translation = await prisma.translation.upsert({ where: { code: "WEB" }, update: {}, create: { code: "WEB", name: "World English Bible", language: "en", license: "Public Domain", isDefault: true } });
  for (const [index, [name, chapterCount, testament]] of canon.entries()) {
    const slug = name.toLowerCase().replaceAll(" ", "-");
    const book = await prisma.bibleBook.upsert({ where: { slug }, update: { ordinal: index + 1, testament }, create: { ordinal: index + 1, name, slug, testament } });
    await prisma.bibleChapter.createMany({ data: Array.from({ length: chapterCount }, (_, chapter) => ({ bookId: book.id, number: chapter + 1 })), skipDuplicates: true });
  }
  const chapter = await prisma.bibleChapter.findFirstOrThrow({ where: { book: { slug: "genesis" }, number: 1 } });
  await prisma.bibleVerse.createMany({ data: genesisOne.map((text, index) => ({ chapterId: chapter.id, translationId: translation.id, number: index + 1, text })), skipDuplicates: true });
  await prisma.chapterProject.upsert({ where: { id: "00000000-0000-4000-8000-000000000001" }, update: {}, create: { id: "00000000-0000-4000-8000-000000000001", chapterId: chapter.id, title: "Creation: order, image, and goodness" } });
  await prisma.promptVersion.upsert({ where: { key_version: { key: "chapter-content-package", version: 1 } }, update: {}, create: { key: "chapter-content-package", version: 1, schemaVersion: "1", template: "Use Scripture and the creator's explanation to produce a structured teaching package. Distinguish quotation, interpretation, context, and uncertainty.", isActive: true } });
}

main().finally(() => prisma.$disconnect());
