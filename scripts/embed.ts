import { PGEssay, PGJSON } from "@/types";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { Configuration, OpenAIApi } from "openai";
import { isMainThread, Worker, workerData } from "worker_threads";

loadEnvConfig("");

const generateEmbeddings = async (essays: PGEssay[], start: number, end: number, tableName: string) => {
  const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
  const openai = new OpenAIApi(configuration);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  for (let i = start; i < Math.min(end, essays.length); i++) {
    const section = essays[i];

    for (let j = 0; j < section.chunks.length; j++) {
      const chunk = section.chunks[j];

      const { essay_title, essay_url, essay_date, essay_thanks, content, content_length, content_tokens } = chunk;

      const embeddingResponse = await openai.createEmbedding({
        model: "text-embedding-ada-002",
        input: content,
      });

      const [{ embedding }] = embeddingResponse.data.data;

      const { data, error } = await supabase
        .from(tableName)
        .insert({
          essay_title,
          essay_url,
          essay_date,
          essay_thanks,
          content,
          content_length,
          content_tokens,
          embedding,
        })
        .select("*");

      if (error) {
        console.log("error", error);
      } else {
        console.log("saved", i, j);
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
};

(async () => {
  const book: PGJSON = JSON.parse(fs.readFileSync("scripts/website.json", "utf8"));
  const essays = book.essays;

  if (isMainThread) {
    const tasksPerWorker = 20;
    const total = essays.length;
    const workerCount = Math.ceil(total / tasksPerWorker);

    for (let i = 0; i < workerCount; i++) {
      const start = i * tasksPerWorker;
      const end = Math.min(start + tasksPerWorker, total);

      new Worker(__filename, {
        workerData: { start, end },
      });
    }
  } else {
    const { start, end } = workerData as { start: number; end: number };
    console.log("start embedding", start, end, "inamori_website");
    await generateEmbeddings(essays, start, end, "embedding_inamori_website");
  }
})();
