/**
 * #ウィンターレーザータグ会2026｜セットアップ用 Apps Script
 *
 * 使い方（1回だけ）:
 *   1. https://script.google.com/ で「新しいプロジェクト」を作り、このファイルの中身を全部貼る
 *   2. 関数の選択で setup を選んで「実行」→ Googleの許可画面で許可する
 *   3. 実行ログに出た「window.LT_CONFIG = …」を Claude に伝える（config.js に入れてサイトにつなぎます）
 *
 * 作られるもの:
 *   - スプレッドシート「レーザータグ2026（データ）」… タブ「記録」「設定」
 *   - フォーム1つ … 入力ページが裏で送信する内部用。人が直接開くものではありません
 *   - スプレッドシートの共有を「リンクを知っている全員が閲覧可」に設定
 *
 * 注意:
 *   - タブの名前とフォームの質問の文言は変えないでください（サイトが名前で探しています）
 *   - 「記録」タブの行は消したり直したりせず、直したいときは入力ページからもう一度入れてください
 *   - 2回実行すると、シートとフォームがもう1組できます（古いほうは消してOK）
 */

const SETUP = { title: 'レーザータグ2026' };
const QUESTIONS = { kind: '種類', key: 'キー', body: '内容' };   // 回答シートの列は A:タイムスタンプ、B〜D がこの順

function setup() {
  const ss = SpreadsheetApp.create(SETUP.title + '（データ）');
  const ssId = ss.getId();

  const f = FormApp.create(SETUP.title + '｜記録（内部用・直接開かない）');
  f.setDescription('入力ページから自動で送られる内部用のフォームです。直接回答しないでください。');
  try { f.setCollectEmail(false); } catch (e) {}
  try { f.setLimitOneResponsePerUser(false); } catch (e) {}
  try { if (typeof f.setPublished === 'function') f.setPublished(true); } catch (e) {}
  f.setAcceptingResponses(true);
  // 選択肢の不一致で送信が弾かれないよう、すべて自由記述にする
  const items = {
    kind: f.addTextItem().setTitle(QUESTIONS.kind),
    key: f.addTextItem().setTitle(QUESTIONS.key),
    body: f.addParagraphTextItem().setTitle(QUESTIONS.body),
  };
  f.setDestination(FormApp.DestinationType.SPREADSHEET, ssId);
  SpreadsheetApp.flush();

  const book = SpreadsheetApp.openById(ssId);
  findResponseSheet_(ssId, f).setName('記録');

  const publishedUrl = f.getPublishedUrl();
  const idMap = extractAnswerIds_(publishedUrl);
  const config = { sheetId: ssId, form: { action: publishedUrl.replace(/\/viewform.*$/, '/formResponse'), entries: {} } };
  Object.keys(items).forEach(k => {
    const id = idMap[items[k].getId()];
    if (!id) throw new Error('entry番号を特定できませんでした: ' + items[k].getTitle());
    config.form.entries[k] = 'entry.' + id;
  });

  const settings = book.getSheets().filter(s => !s.getFormUrl())[0] || book.insertSheet();
  settings.setName('設定');
  settings.getRange(1, 1, 5, 2).setValues([
    ['項目', '値'],
    ['シートID', ssId],
    ['config', JSON.stringify(config)],
    ['フォーム（編集用）', f.getEditUrl()],
    ['メモ', 'このスプシは「リンクを知っている全員が閲覧可」です。タブ名とフォームの質問は変えないでください。'],
  ]);

  let shared = true;
  try {
    DriveApp.getFileById(ssId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) { shared = false; }

  Logger.log([
    '✅ セットアップ完了',
    'スプレッドシート: ' + book.getUrl(),
    shared ? '共有設定: リンクを知っている全員が閲覧可にしました'
           : '⚠ 共有設定を変更できませんでした。スプシの「共有」→「リンクを知っている全員」→「閲覧者」にしてください',
    '',
    '↓ これを Claude に伝えてください（config.js の中身）',
    'window.LT_CONFIG = ' + JSON.stringify(config, null, 2) + ';',
  ].join('\n'));
}

// 送信に使う entry 番号（公開ページのHTMLにある本当の番号。item.getId() とは別物）
function extractAnswerIds_(publishedUrl) {
  const html = UrlFetchApp.fetch(publishedUrl, { followRedirects: true, muteHttpExceptions: true }).getContentText();
  const m = html.match(/FB_PUBLIC_LOAD_DATA_ = ([\s\S]*?);\s*<\/script>/);
  if (!m) throw new Error('フォームの構造を読み取れませんでした（FB_PUBLIC_LOAD_DATA_ が見つかりません）');
  const map = {};
  JSON.parse(m[1])[1][1].forEach(it => { if (it[4] && it[4][0]) map[it[0]] = it[4][0][0]; });
  return map;
}

function findResponseSheet_(ssId, form) {
  const formId = form.getId();
  for (let i = 0; i < 10; i++) {
    const hit = SpreadsheetApp.openById(ssId).getSheets().find(s => {
      const url = s.getFormUrl();
      if (!url) return false;
      if (url.indexOf(formId) >= 0) return true;
      try { return FormApp.openByUrl(url).getId() === formId; } catch (e) { return false; }
    });
    if (hit) return hit;
    Utilities.sleep(1500);
  }
  throw new Error('フォームの回答シートが見つかりませんでした：' + form.getTitle());
}
