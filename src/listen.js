'use strict';

// Listening links.
//
// The mini-program resolves a QQ song mid through a cloud function and jumps to
// https://y.qq.com/n/ryqq/songDetail/<mid>. We cannot use QQ's private API, so:
//   - when an authorised provider ever supplies qqSongMid / qqAlbumMid /
//     netease ids, we build an EXACT detail link;
//   - otherwise we build QQ Music / NetEase Cloud Music search deep links, which
//     reliably land the listener on the full song (no 30s preview limitation);
//   - Apple Music gets an exact link because iTunes hands us collectionViewUrl /
//     trackViewUrl for free.
// Nothing here calls a private endpoint or needs a login cookie; these are the
// public web URLs a user would open themselves.

const QQ = {
  search: (query) => `https://y.qq.com/n/ryqq/search?w=${encodeURIComponent(query)}`,
  song: (mid) => `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(mid)}`,
  album: (mid) => `https://y.qq.com/n/ryqq/albumDetail/${encodeURIComponent(mid)}`
};

const NETEASE = {
  search: (query, type) => `https://music.163.com/#/search/m/?s=${encodeURIComponent(query)}&type=${type}`,
  song: (id) => `https://music.163.com/#/song?id=${encodeURIComponent(id)}`,
  album: (id) => `https://music.163.com/#/album?id=${encodeURIComponent(id)}`
};

const clean = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

/**
 * @param {object} entity  album or track row (camelCase)
 * @param {'album'|'song'} kind
 * @returns {{primary: string, platforms: Array<{key,name,url,exact,kind,note}>}}
 */
function buildListenLinks(entity, kind) {
  if (!entity) return { primary: 'qq', platforms: [] };

  const artist = clean(entity.artistDisplay || entity.artist || entity.primaryArtistName);
  const title = clean(entity.title);
  const albumTitle = clean(entity.albumTitle || (kind === 'album' ? entity.title : ''));
  const songQuery = [title, artist].filter(Boolean).join(' ');
  const albumQuery = [albumTitle || title, artist].filter(Boolean).join(' ');
  const platforms = [];

  const qqMid = kind === 'album' ? entity.qqAlbumMid || entity.qqListenSongMid : entity.qqSongMid;
  if (qqMid) {
    platforms.push({
      key: 'qq', name: 'QQ音乐', kind: 'detail', exact: true,
      url: kind === 'album' ? QQ.album(qqMid) : QQ.song(qqMid),
      note: '已匹配到 QQ 音乐曲库条目'
    });
  } else {
    platforms.push({
      key: 'qq', name: 'QQ音乐', kind: 'search', exact: false,
      url: QQ.search(kind === 'album' ? albumQuery : songQuery),
      note: '在 QQ 音乐中搜索完整版'
    });
  }

  const neteaseId = kind === 'album' ? entity.neteaseAlbumId : entity.neteaseSongId;
  if (neteaseId) {
    platforms.push({
      key: 'netease', name: '网易云音乐', kind: 'detail', exact: true,
      url: kind === 'album' ? NETEASE.album(neteaseId) : NETEASE.song(neteaseId),
      note: '已匹配到网易云曲库条目'
    });
  } else {
    platforms.push({
      key: 'netease', name: '网易云音乐', kind: 'search', exact: false,
      url: NETEASE.search(kind === 'album' ? albumQuery : songQuery, kind === 'album' ? 10 : 1),
      note: '在网易云音乐中搜索完整版'
    });
  }

  if (entity.provider === 'itunes' && entity.externalUrl) {
    platforms.push({
      key: 'apple', name: 'Apple Music', kind: 'detail', exact: true,
      url: entity.externalUrl, note: 'Apple Music 官方条目'
    });
  }

  return { primary: 'qq', platforms };
}

module.exports = { buildListenLinks, QQ, NETEASE };