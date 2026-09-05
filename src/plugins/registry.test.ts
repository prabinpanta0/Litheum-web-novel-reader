import { describe, it, expect } from 'vitest';
import { normalizeEntry, nameToId } from './registry';

describe('normalizeEntry', () => {
  it('maps a registry entry to SourceMeta', () => {
    expect(
      normalizeEntry({
        id: 'fks',
        name: 'First Kiss',
        site: 'https://fks.example/',
        lang: 'English',
        version: '1.2.0',
        url: 'https://raw/x.js',
      })
    ).toEqual({
      id: 'fks',
      name: 'First Kiss',
      site: 'https://fks.example/',
      lang: 'English',
      version: '1.2.0',
      url: 'https://raw/x.js',
      iconUrl: '',
    });
  });

  it('falls back to raw icon field and defaults', () => {
    expect(
      normalizeEntry({ id: 'a', name: 'A', icon: 'ic.png' } as any)
    ).toMatchObject({ iconUrl: 'ic.png', lang: 'Unknown', version: '0' });
  });

  it('rejects entries without an id or name', () => {
    expect(normalizeEntry({})).toBeNull();
    expect(normalizeEntry({ id: 'x' })).toBeNull();
  });
});

describe('nameToId', () => {
  it('produces a stable, url-derived id', () => {
    expect(nameToId('https://example.com/a')).toBe(
      nameToId('https://example.com/a')
    );
    expect(nameToId('https://example.com/a')).not.toBe(
      nameToId('https://example.com/b')
    );
  });
});
