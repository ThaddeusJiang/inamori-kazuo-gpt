import { PGChunk, PGEssay, PGJSON } from "@/types";
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import { encode } from "gpt-3-encoder";

const BASE_URL = "https://www.kyocera.co.jp";

const CHUNK_SIZE = 200;

const getLinks = async ({ url, selector }: { url: string; selector: string }) => {
  const html = await axios.get(url);
  const $ = cheerio.load(html.data);
  const linkDOMs = $(selector);

  const linksArr: { url: string; title: string }[] = [];

  linkDOMs.each((i, link) => {
    const links = $(link).find("a");
    links.each((i, link) => {
      const url = $(link).attr("href");
      const title = $(link).text();

      if (url && url.endsWith(".html")) {
        const linkObj = {
          url,
          title,
        };

        linksArr.push(linkObj);
      }
    });
  });

  return linksArr;
};

const getEssay = async (linkObj: { url: string; title: string }) => {
  const { title, url } = linkObj;

  let essay: PGEssay = {
    title: "",
    url: "",
    date: "",
    thanks: "",
    content: "",
    length: 0,
    tokens: 0,
    chunks: [],
  };

  const fullLink = BASE_URL + url;
  const html = await axios.get(fullLink);
  const $ = cheerio.load(html.data);

  const text = $("#mainContents").text();

  const cleanedText = text.replace(/\s+/g, " ");
  const trimmedContent = cleanedText.trim();

  essay = {
    title,
    url: fullLink,
    date: "", // TODO: get date
    thanks: "", // TODO: get thanks
    content: trimmedContent,
    length: trimmedContent.length,
    tokens: encode(trimmedContent).length,
    chunks: [],
  };

  return essay;
};

const chunkEssay = async (essay: PGEssay) => {
  const { title, url, date, thanks, content, ...rest } = essay;

  let essayTextChunks = [];

  if (encode(content).length > CHUNK_SIZE) {
    const split = content.split("。");
    let chunkText = "";

    for (let i = 0; i < split.length; i++) {
      const sentence = split[i];
      const sentenceTokenLength = encode(sentence);
      const chunkTextTokenLength = encode(chunkText).length;

      if (chunkTextTokenLength + sentenceTokenLength.length > CHUNK_SIZE) {
        essayTextChunks.push(chunkText);
        chunkText = "";
      }

      chunkText += sentence + "。";
    }

    essayTextChunks.push(chunkText.trim());
  } else {
    essayTextChunks.push(content.trim());
  }

  const essayChunks = essayTextChunks
    .filter((text) => text.trim().length > 0)
    .map((text) => {
      const trimmedText = text.trim();

      const chunk: PGChunk = {
        essay_title: title,
        essay_url: url,
        essay_date: date,
        essay_thanks: thanks,
        content: trimmedText,
        content_length: trimmedText.length,
        content_tokens: encode(trimmedText).length,
        embedding: [],
      };

      return chunk;
    });

  if (essayChunks.length > 1) {
    for (let i = 0; i < essayChunks.length; i++) {
      const chunk = essayChunks[i];
      const prevChunk = essayChunks[i - 1];

      if (chunk.content_tokens < 100 && prevChunk) {
        prevChunk.content += " " + chunk.content;
        prevChunk.content_length += chunk.content_length;
        prevChunk.content_tokens += chunk.content_tokens;
        essayChunks.splice(i, 1);
        i--;
      }
    }
  }

  const chunkedSection: PGEssay = {
    ...essay,
    chunks: essayChunks,
  };

  return chunkedSection;
};

(async () => {
  let essays: PGEssay[] = [];

  // TODO: 稲盛和夫の歩み www.kyocera.co.jp/inamori/profile/
  // TODO: 年譜
  // TODO: エピソード
  // TODO: まんが稲盛和夫
  // TODO: 出版物 https://www.kyocera.co.jp/inamori/publication/

  // フィロソフィ https://www.kyocera.co.jp/inamori/philosophy/
  const plinks = await getLinks({
    url: `${BASE_URL}/inamori/philosophy/`,
    selector: "#mainContents dd",
  });
  // TODO: plinks is not an array of links
  for (let i = 0; i < plinks.length; i++) {
    const essay = await getEssay(plinks[i]);
    const chunkedEssay = await chunkEssay(essay);
    essays.push(chunkedEssay);
  }

  // 経営の原点 https://www.kyocera.co.jp/inamori/management/
  const mlinks = await getLinks({
    url: `${BASE_URL}/inamori/management/`,
    selector: "#history_mainContents dd",
  });
  for (let i = 0; i < mlinks.length; i++) {
    const essay = await getEssay(mlinks[i]);
    const chunkedEssay = await chunkEssay(essay);
    essays.push(chunkedEssay);
  }

  // 社会活動 https://www.kyocera.co.jp/inamori/contribution/
  const clinks = await getLinks({
    url: `${BASE_URL}/inamori/contribution/`,
    selector: "#history_mainContents dd",
  });
  for (let i = 0; i < clinks.length; i++) {
    const essay = await getEssay(clinks[i]);
    const chunkedEssay = await chunkEssay(essay);
    essays.push(chunkedEssay);
  }

  const json: PGJSON = {
    current_date: new Date().toISOString(),
    author: "稲盛和夫",
    url: `${BASE_URL}`,
    length: essays.reduce((acc, essay) => acc + essay.length, 0),
    tokens: essays.reduce((acc, essay) => acc + essay.tokens, 0),
    essays,
  };

  fs.writeFileSync("scripts/website.json", JSON.stringify(json));
})();
