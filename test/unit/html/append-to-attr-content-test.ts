'use strict';

import { builders as b } from '@glimmer/syntax';
import processTemplate from '../../helpers/process-template';
import { appendToAttrContent } from '../../../lib/html';

describe('Helper #appendToAttrContent', function() {
  it('it can append undefined (which does nothing)', function() {
    let modifiedTemplate = processTemplate(`<div class="foo"></div>`, {
      AttrNode(attr) {
        attr.value = appendToAttrContent(undefined, attr.value);
        attr.value = appendToAttrContent(undefined, attr.value);
        return attr;
      }
    });

    expect(modifiedTemplate).toEqual(`<div class="foo"></div>`);
  });

  it('it can append null (which does nothing)', function() {
    let modifiedTemplate = processTemplate(`<div class="foo"></div>`, {
      AttrNode(attr) {
        attr.value = appendToAttrContent(null, attr.value);
        attr.value = appendToAttrContent(null, attr.value);
        return attr;
      }
    });

    expect(modifiedTemplate).toEqual(`<div class="foo"></div>`);
  });

  it('it can append regular strings', function() {
    let modifiedTemplate = processTemplate(`<div class="foo"></div>`, {
      AttrNode(attr) {
        attr.value = appendToAttrContent('bar', attr.value);
        attr.value = appendToAttrContent('baz', attr.value);
        return attr;
      }
    });

    expect(modifiedTemplate).toEqual(`<div class="foo bar baz"></div>`);
  });

  it('it can append StringLiterals', function() {
    let modifiedTemplate = processTemplate(`<div class="foo"></div>`, {
      AttrNode(attr) {
        attr.value = appendToAttrContent(b.string('bar'), attr.value);
        attr.value = appendToAttrContent(b.string('baz'), attr.value);
        return attr;
      }
    });

    expect(modifiedTemplate).toEqual(`<div class="foo bar baz"></div>`);
  });

  it('it can append NumberLiterals', function() {
    let modifiedTemplate = processTemplate(`<div class="foo"></div>`, {
      AttrNode(attr) {
        attr.value = appendToAttrContent(b.number(1), attr.value);
        attr.value = appendToAttrContent(b.number(2), attr.value);
        return attr;
      }
    });

    expect(modifiedTemplate).toEqual(`<div class="foo 1 2"></div>`);
  });

  it('it can append TextNodes to another TextNode', function() {
    let modifiedTemplate = processTemplate(`<div class="foo"></div>`, {
      AttrNode(attr) {
        attr.value = appendToAttrContent(b.text('bar'), attr.value);
        attr.value = appendToAttrContent(b.text('baz'), attr.value);
        return attr;
      }
    });

    expect(modifiedTemplate).toEqual(`<div class="foo bar baz"></div>`);
  });

  it('it can append PathExpression', function() {
    let modifiedTemplate = processTemplate(`<div class="foo"></div>`, {
      AttrNode(attr) {
        attr.value = appendToAttrContent(b.path('bar'), attr.value);
        attr.value = appendToAttrContent(b.path('baz'), attr.value);
        return attr;
      }
    });

    expect(modifiedTemplate).toEqual(`<div class="foo {{bar}} {{baz}}"></div>`);
  });

  it('it can append MustacheStatement', function() {
    let modifiedTemplate = processTemplate(`<div class="foo"></div>`, {
      AttrNode(attr) {
        attr.value = appendToAttrContent(b.mustache(b.path('bar')), attr.value);
        attr.value = appendToAttrContent(b.mustache(b.path('baz')), attr.value);
        attr.value = appendToAttrContent(b.mustache(b.path('if'), [b.path('condition'), b.string('yes'), b.string('no')]), attr.value);
        return attr;
      }
    });

    expect(modifiedTemplate).toEqual(`<div class="foo {{bar}} {{baz}} {{if condition "yes" "no"}}"></div>`);
  });

  it('it can append SubExpressions', function() {
    let modifiedTemplate = processTemplate(`<div class="foo"></div>`, {
      AttrNode(attr) {
        attr.value = appendToAttrContent(b.sexpr(b.path('some-helper'), [b.string('someArg')]), attr.value);
        attr.value = appendToAttrContent(b.sexpr(b.path('if'), [b.path('condition'), b.string('yes'), b.string('no')]), attr.value);
        return attr;
      }
    });

    expect(modifiedTemplate).toEqual(`<div class="foo {{some-helper "someArg"}} {{if condition "yes" "no"}}"></div>`);
  });

  it('it can append ConcatStatements', function() {
    let modifiedTemplate = processTemplate(`<div class="foo"></div>`, {
      AttrNode(attr) {
        let val = b.concat([b.text('prefix'), b.mustache(b.path('boundVal')), b.text('suffix')]);
        attr.value = appendToAttrContent(val, attr.value);
        let val2 = b.concat([b.text('prefix2'), b.mustache(b.path('boundVal2'))]);
        attr.value = appendToAttrContent(val2, attr.value);
        return attr;
      }
    });

    expect(modifiedTemplate).toEqual(`<div class="foo prefix{{boundVal}}suffix prefix2{{boundVal2}}"></div>`);
  });

  it('it can mix and append a mix of elements', function() {
    let modifiedTemplate = processTemplate(`<div class="foo"></div>`, {
      AttrNode(attr) {
        attr.value = appendToAttrContent(b.mustache(b.path('one')), b.text(''));
        attr.value = appendToAttrContent(b.mustache(b.path('two')), attr.value);
        attr.value = appendToAttrContent(b.text('three'), attr.value);
        attr.value = appendToAttrContent('four', attr.value);
        attr.value = appendToAttrContent(b.path('five'), attr.value);
        attr.value = appendToAttrContent(b.mustache(b.path('if'), [b.path('condition'), b.string('yes'), b.string('no')]), attr.value);
        attr.value = appendToAttrContent(b.path('six'), attr.value);
        attr.value = appendToAttrContent(b.concat([b.mustache(b.path('sev')), b.text('en')]), attr.value);
        return attr;
      }
    });

    expect(modifiedTemplate).toEqual(`<div class="{{one}} {{two}} three four {{five}} {{if condition "yes" "no"}} {{six}} {{sev}}en"></div>`);
  });

  it('it can mix and append a mix of elements without prepending spaces', function() {
    let modifiedTemplate = processTemplate(`<div class="foo"></div>`, {
      AttrNode(attr) {
        attr.value = appendToAttrContent(b.mustache(b.path('one')), b.text(''), { prependSpace: false });
        attr.value = appendToAttrContent(b.mustache(b.path('two')), attr.value, { prependSpace: false });
        attr.value = appendToAttrContent(b.text('three'), attr.value, { prependSpace: false });
        attr.value = appendToAttrContent('four', attr.value, { prependSpace: false });
        attr.value = appendToAttrContent(b.path('five'), attr.value, { prependSpace: false });
        attr.value = appendToAttrContent(b.mustache(b.path('if'), [b.path('condition'), b.string('yes'), b.string('no')]), attr.value, { prependSpace: false });
        attr.value = appendToAttrContent(b.path('six'), attr.value, { prependSpace: false });
        attr.value = appendToAttrContent(b.concat([b.mustache(b.path('sev')), b.text('en')]), attr.value, { prependSpace: false });
        return attr;
      }
    });

    expect(modifiedTemplate).toEqual(`<div class="{{one}}{{two}}threefour{{five}}{{if condition "yes" "no"}}{{six}}{{sev}}en"></div>`);
  });
});
