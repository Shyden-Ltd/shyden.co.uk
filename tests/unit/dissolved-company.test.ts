import { describe, expect, it } from 'vitest';
import { dissolvedIn } from '../dissolved-company';
import { renderedText } from '../html-text';

/**
 * What the site printed about the company before #370, copied from
 * `494836b^` (src/lib/i18n/site.ts and src/components/Footer.astro). These
 * are the strings that must never reach a page again, so each must be caught.
 * The two lists this replaces caught the English and Indonesian lines and
 * none of the Chinese, Vietnamese or Thai registration sentences (#390 F116).
 */
const PRINTED_BEFORE_370 = [
  'Shyden Ltd — a new technology company',
  'Registered in England & Wales.',
  'Company No.',
  'Registered office:',
  '71-75 Shelton Street, Covent Garden, London, United Kingdom, WC2H 9JQ',
  '17110487',
  'Perusahaan baru',
  'Terdaftar di Inggris & Wales.',
  'No. Perusahaan',
  'Kantor terdaftar:',
  '一家新公司',
  '注册于England & Wales。',
  '公司编号：',
  '注册办事处：',
  'Một công ty mới',
  'Được đăng ký tại England & Wales.',
  'Số đăng ký doanh nghiệp',
  'Trụ sở chính:',
  'บริษัทเทคโนโลยีน้องใหม่',
  'จดทะเบียนใน England & Wales',
  'เลขทะเบียนบริษัท',
  'สำนักงานจดทะเบียน:',
];

describe('dissolvedIn: every form the dissolved company was printed in', () => {
  it.each(PRINTED_BEFORE_370)('catches %s', (printed) => {
    expect(dissolvedIn(printed)).not.toEqual([]);
  });

  it('catches the registration line as served, ampersand escaped', () => {
    const served = '<p>注册于England &amp; Wales。</p>';
    expect(dissolvedIn(renderedText(served))).not.toEqual([]);
  });

  it('reads Ltd as a word, not as letters inside one', () => {
    expect(dissolvedIn('Altdorf and Ltda.')).toEqual([]);
    expect(dissolvedIn('Shyden Ltd.')).toEqual(['Ltd']);
  });

  it('passes the copy the site prints today', () => {
    expect(
      dissolvedIn(
        'Built for teachers, by Shyden. Questions or problems? support@shyden.co.uk',
      ),
    ).toEqual([]);
  });
});
