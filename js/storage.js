// js/storage.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ★あなたの情報
export const SUPABASE_URL = 'https://mabggyxwheluuopysqhi.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hYmdneXh3aGVsdXVvcHlzcWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNDk1MzMsImV4cCI6MjA3NTgyNTUzM30.q6VOi2b_3DPF8G9P4VicoURZhbDCcejDL9DMT9S7gUE';

// バケット名
const BUCKET = 'nenga';

// Supabase クライアント（セッション保持不要）
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

/**
 * dataURL(WebP) を Supabase Storage へアップロードして公開URLを返す
 * - 既存ポリシーが INSERT のみでも動くように、毎回ユニークな key を生成
 * - upsert: false
 */
export async function uploadBgWebP(dataUrl, shortId) {
  // dataURL -> Blob
  const blob = await fetch(dataUrl).then(r => r.blob());

  // 一意なファイル名（INSERTのみでも衝突しない）
  const stamp = Date.now().toString(36);
  const rand  = Math.random().toString(36).slice(2, 6);
  const safe  = (shortId || 'u').replace(/[^a-z0-9_-]/gi, '').slice(0, 16).toLowerCase();
  const key   = `bg/${safe}-${stamp}-${rand}.webp`;

  // アップロード（上書き禁止）
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, blob, {
      contentType: 'image/webp',
      cacheControl: '31536000, immutable',
      upsert: false
    });

  if (error) {
    console.error('[Supabase upload error]', error);
    throw error;
  }

  // 公開URLを取得
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return data.publicUrl; // string
}
