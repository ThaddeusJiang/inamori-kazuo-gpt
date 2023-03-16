--  RUN 1st
create extension vector;

-- RUN 2nd
create table embedding_inamori_website (
  id bigserial primary key,
  essay_title text,
  essay_url text,
  essay_date text,
  essay_thanks text,
  content text,
  content_length bigint,
  content_tokens bigint,
  embedding vector (1536)
);

-- RUN 3rd after running the scripts
create or replace function inamori_search (
  query_embedding vector(1536),
  similarity_threshold float,
  match_count int
)
returns table (
  id bigint,
  essay_title text,
  essay_url text,
  essay_date text,
  essay_thanks text,
  content text,
  content_length bigint,
  content_tokens bigint,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    inamori.id,
    inamori.essay_title,
    inamori.essay_url,
    inamori.essay_date,
    inamori.essay_thanks,
    inamori.content,
    inamori.content_length,
    inamori.content_tokens,
    1 - (inamori.embedding <=> query_embedding) as similarity
  from embedding_inamori_website AS inamori
  where 1 - (inamori.embedding <=> query_embedding) > similarity_threshold
  order by inamori.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- RUN 4th
create index on embedding_inamori_website
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);