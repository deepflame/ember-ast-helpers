import { appendToAttrContent, buildAttr, BuildAttrContent } from './html';
import {
  builders as b,
  traverse,
  AST,
  NodeVisitor,
  preprocess
} from '@glimmer/syntax';

function dashify(str: string): string {
  str = str.replace(/([a-z])([A-Z])/g, '$1-$2');
  str = str.replace(/[ \t\W]/g, '-');
  str = str.replace(/^-+|-+$/g, '');
  return str.toLowerCase();
};

// TODO: Extract this helper to a public utility
function buildConditional(cond: AST.PathExpression | AST.SubExpression, truthyValue: string, falsyValue: string | undefined): AST.MustacheStatement {
  let mustacheArgs : AST.Expression[]= [cond];
  mustacheArgs.push(b.string(truthyValue));
  if (falsyValue) {
    mustacheArgs.push(b.string(falsyValue));
  }
  return b.mustache(b.path('if'), mustacheArgs);
}

export { default as interpolateProperties } from './build-time-component/interpolate-properties';
export type BuildTimeComponentOptions = {
  tagName: string
  classNames: string[]
  classNameBindings: string[]
  attributeBindings: string[]
  contentVisitor?: NodeVisitor
  [key: string]: any
}

export type BuildTimeComponentNode = AST.MustacheStatement | AST.BlockStatement
type InvocationAttrsObject = { [key: string]: AST.Literal | AST.PathExpression | AST.SubExpression }

/**
 * This is supposed to be the main abstraction used by most people to achieve most of their works
 * Only when they want to do something extra the can override methods and do it themselves.
 *
 * It has some basic behaviour by default to remind how "real" ember components work, but very little.
 * Namely, the `class` property is automatically bound to `class` attribute in the resulting HTMLElement.
 * Also, if on initialization the user passes `classNames`, the classes in that array will be concatenated
 * with the value passed to `class`.
 * The user can also pass default values for the properties the component doesn't receive on invocation.
 *
 * That object has two main properties to help working with this abstraction useful.
 *
 * - `classNameBindings`: Identical behavior to the one in Ember components
 * - `attributeBindings`: Almost identical behaviour to the one in Ember components, with one enhancements.
 *   Some attributes are expected to have regular values (p.e. the `title` attribute must have a string),
 *   so `{{my-component title=username}}` compiles to `<div title={{username}}></div>`.
 *   However, there is properties that are expected to be boolean that when converted to attributes
 *   should have other values. That is why you can pass `attributeBindings: ['isDisabled:disabled:no']`
 *   You will notice that in regular Ember components, the items in attribute bindings only have one `:`
 *   dividing propertyName and attributeName. If you put two semicolons dividing the string in three parts
 *   the third part will be used for the truthy value, generating in the example above `<div disabled={{if disabled 'no'}}></div>`
 *
 * More example usages:
 *
 * let component = new BuildTimeComponent(node); // creates the component
 * component.toNode(); // generates the element with the right markup
 *
 * let soldier = new BuildTimeComponent(node, {
 *   classNameBindings: ['active:is-deployed:reservist'],
 *   attributeBindings: ['title', 'url:href', 'ariaHidden:aria-hidden:true']
 * });
 */

export default class BuildTimeComponent {
  private _defaultTagName: string = 'div'
  private _defaultClassNames: string[] = []
  private _defaultClassNameBindings: string[] = []
  private _defaultAttributeBindings: string[] = ['id', 'class']
  private _defaultPositionalParams: string[] = []
  private _contentVisitor?: NodeVisitor
  private _attrs?: InvocationAttrsObject
  node: BuildTimeComponentNode
  options: Partial<BuildTimeComponentOptions>
  [key: string]: any

  constructor(node: BuildTimeComponentNode, options: Partial<BuildTimeComponentOptions> = {}) {
    this.node = node;
    this.options = options;
  }

  // Getters/setters to mimic Ember components
  get tagName(): string {
    let tagName = this.invocationAttrs.tagName;
    if (tagName === undefined) {
      return this.options.tagName || this._defaultTagName;
    } else if (tagName.type === 'StringLiteral') {
      return tagName.value;
    } else {
      throw new Error(`Build-time components cannot receive tagName hash properties with type ${tagName.type}`);
    }
  }
  set tagName(str: string) {
    this._defaultTagName = str
  }

  get invocationAttrs(): { [key: string]: AST.Literal | AST.PathExpression | AST.SubExpression } {
    if (!this._attrs) {
      let attrs: InvocationAttrsObject = {};
      this.positionalParams.forEach((param, i) => {
        if (i < this.node.params.length) {
          attrs[param] = this.node.params[i];
        }
      });
      this.node.hash.pairs.forEach((pair) => {
        attrs[pair.key] = pair.value;
      });

      this._attrs = attrs;
    }
    return this._attrs;
  }

  get attributeBindings() {
    return this._defaultAttributeBindings.concat(this.options.attributeBindings || [])
  }
  set attributeBindings(attributeBindings: string[]) {
    this._defaultAttributeBindings = this._defaultAttributeBindings.concat(attributeBindings);
  }

  get classNames() {
    return this._defaultClassNames.concat(this.options.classNames || [])
  }
  set classNames(classNames: string[]) {
    this._defaultClassNames = this._defaultClassNames.concat(classNames);
  }

  get classNameBindings() {
    return this._defaultClassNameBindings.concat(this.options.classNameBindings || [])
  }
  set classNameBindings(classNameBindings: string[]) {
    this._defaultClassNameBindings = this._defaultClassNameBindings.concat(classNameBindings);
  }

  get positionalParams() {
    return this._defaultPositionalParams.concat(this.options.positionalParams || [])
  }
  set positionalParams(positionalParams: string[]) {
    this._defaultPositionalParams = this._defaultPositionalParams.concat(positionalParams);
  }

  // Internal methods
  get contentVisitor(): NodeVisitor | undefined {
    return this._contentVisitor || this.options.contentVisitor;
  }
  set contentVisitor(visitor: NodeVisitor | undefined) {
    this._contentVisitor = visitor;
  }

  layout(args: TemplateStringsArray) {
    this._layout = preprocess(args[0]);
  }

  classContent(): BuildAttrContent | undefined {
    let content: AST.AttrNode['value'] | undefined;
    if (this.classNames.length > 0) {
      content = appendToAttrContent(this.classNames.join(' '))
    }
    content = this._applyClassNameBindings(content);
    if (this.invocationAttrs.class !== undefined) {
      content = appendToAttrContent(this.invocationAttrs.class, content);
    }
    return content;
  }

  // Element getters

  /**
   * Attribute bindings have this format: `<propName>:<attrName>:<truthyValue>`.
   *
   * These bindings can be of two types, boolean or regular.
   *
   * Boolean:
   * - `attributeBinding: ['active:aria-active:on:off']`
   *   when true => `<div aria-active="on">`
   *   when false => `<div aria-active="off">`
   *   when dynamic => `<div aria-active={{if active 'on' 'off'}}>`
   * - `attributeBinding: ['active:aria-active:on']`
   *   when true => `<div aria-active="on">`
   *   when false => `<div>`
   *   when dynamic => `<div aria-active={{if active 'on'}}>`
   * - `attributeBinding: ['active:aria-active']` but we can determine statically that `active` is
   *   expected to be a boolean
   *   when true => `<div aria-active="true">`
   *   when false => `<div>`
   *   when dynamic => `<div aria-active={{if active 'true'}}>`
   * - `attributeBinding: ['active']` but we can determine statically that `active` is expected
   *   to be a boolean:
   *   when true => `<div active="true">`
   *   when false => `<div>`
   *   when dynamic => `<div active={{if active 'true'}}>`
   *
   * Regular:
   * - `attributeBinding: ['title']` and we can't determine that title is a boolean in compile time
   *   When the value is static => `<div title="some text">`
   *   When the value is dynamic => `<div title={{title}}>`
   */
  get elementAttrs(): AST.AttrNode[] {
    let attrs: AST.AttrNode[] = [];
    this.attributeBindings.forEach((binding) => {
      let {
        isBooleanBinding,
        computedValue,
        staticValue,
        invocationValue,
        attrName,
        propName,
        truthyValue,
        falsyValue
      } = this._analyzeBinding(binding, { propertyAlias: true });

      let content;
      if (isBooleanBinding) {
        truthyValue = truthyValue || 'true';
        if (computedValue !== undefined) {
          content = computedValue ? truthyValue : falsyValue;
        } else if (invocationValue !== undefined) {
          if (AST.isLiteral(invocationValue)) {
            content = invocationValue.value ? truthyValue : falsyValue;
          } else {
            content = buildConditional(invocationValue, truthyValue, falsyValue)
          }
        } else {
          content = staticValue ? truthyValue : falsyValue;
        }
      } else {
        content = computedValue || invocationValue || staticValue;
      }
      let attr = buildAttr(<string>attrName, content);
      if (attr !== null) {
        attrs.push(attr);
      }
    });
    return attrs;
  }

  get elementModifiers(): AST.ElementModifierStatement[] {
    return [];
  }

  get elementChildren(): AST.Statement[] {
    if (this.node.type === 'BlockStatement') {
      if (this.contentVisitor) {
        traverse(this.node.program, this.contentVisitor)
      }
      return this.node.program.body;
    } else {
      if (this._layout !== undefined) {
        traverse(this._layout, {
          MustacheStatement: (node) => {
            if (node.params.length + node.hash.pairs.length === 0) {
              let propName = node.path.original;
            }
          }
        });
        return this._layout.body;
      }
      return [];
    }
  }

  toElement(): AST.ElementNode {
    return b.element(this.tagName, this.elementAttrs, this.elementModifiers, this.elementChildren);
  }

  // private

  /**
   * There is two possible kinds of classNameBindings: boolean or regular
   *
   * Boolean bindings are those that must be interpreted by the truthyness or falsyness of the
   * property they are bound to.
   *
   * A bindings is deemed boolean when either of this conditions is met:
   * - If the binding definition contains truthy or falsy values, it always considered boolean,
   *   regardless of the type of value on that property. E.g: `classNameBindings: ['enabled:on:off']`
   *
   * - If the binding has no truthy/falsy values but its property has been initialized to a boolean
   *   value, then it's reasonably safe that the developer expects it to be a boolean. In that case,
   *   just like Ember.Component does, the truthy value will be the dasherized name of the property,
   *   and when false, it won't have a false value.
   *   E.g. `new BuildTimeComponent(node, { classNameBindings: ['isActive'], isActive: true })` will
   *   generate `<div class="is-active"></div>`. If the component is invoked with a dynamic value
   *   on that property (`{{my-foo isActive=condition}}`) it generates `<div class={{if condition "is-active"}}></div>`
   *
   * - If the binding doesn't have truthy/falsy values, and the property hasn't been initialized to
   *   a boolean value, but the invocation passed the property as a boolean literal, it's also
   *   considered a boolean.
   *   E.g. `new BuildTimeComponent(node, { classNameBindings: ['isActive']})` invoked with
   *   `{{my-foo isActive=true}}` will generate `<div class="is-active"></div>`
   *
   * Regular bindings are simpler than that. If the value is just added to the class. If we can
   * determine the value in compile time, it will generate `<div class="a b c propValue"></div>`,
   * and if it can't, it will be interpolated `<div class="a b c {{prop}}"></div>`
   */
  _applyClassNameBindings(content: AST.AttrNode['value'] | undefined): AST.AttrNode['value'] | undefined {
    this.classNameBindings.forEach((binding) => {
      let {
        isBooleanBinding,
        computedValue,
        staticValue,
        invocationValue,
        propName,
        truthyValue,
        falsyValue
      } = this._analyzeBinding(binding, { propertyAlias: false });

      if (isBooleanBinding) {
        truthyValue = truthyValue || dashify(propName);
        if (computedValue !== undefined) {
          let part = computedValue ? truthyValue : falsyValue;
          if (part) {
            content = appendToAttrContent(part, content);
          }
        } else if (invocationValue !== undefined) {
          if (AST.isLiteral(invocationValue)) {
            let part = invocationValue.value ? truthyValue : falsyValue;
            if (part) {
              content = appendToAttrContent(part, content);
            }
          } else {
            content = appendToAttrContent(buildConditional(invocationValue, truthyValue, falsyValue), content)
          }
        } else {
          content = appendToAttrContent(staticValue ? truthyValue : falsyValue, content);
        }
      } else {
        content = appendToAttrContent(computedValue || invocationValue || staticValue, content);
      }
    });
    return content;
  }

  _analyzeBinding(binding: string, { propertyAlias = true } = {}) {
    let bindingParts = binding.split(':');
    let isBooleanBinding = bindingParts.length > (propertyAlias ? 2 : 1);
    let [propName] = bindingParts;
    let { invocationValue, computedValue, staticValue } = this._getProperty(propName);
    if (!isBooleanBinding) {
      if (computedValue !== undefined) {
        isBooleanBinding = typeof computedValue === 'boolean';
      } else if (staticValue === undefined && invocationValue !== undefined && invocationValue.type === 'BooleanLiteral') {
        isBooleanBinding = true;
      } else {
        isBooleanBinding = typeof staticValue === 'boolean';
      }
    }
    let attrName, truthyValue, falsyValue;
    if (propertyAlias) {
      [attrName, truthyValue, falsyValue] = bindingParts.slice(1)
      if (attrName === undefined) {
        attrName = propName;
      }
    } else {
      [truthyValue, falsyValue] = bindingParts.slice(1)
    }
    return {
      isBooleanBinding,
      computedValue,
      staticValue,
      invocationValue,
      propName,
      attrName,
      truthyValue,
      falsyValue
    };
  }

  _getProperty(propName: string) {
    let invocationValue = this.invocationAttrs[propName];
    let computedValue, staticValue;
    if (this[`${propName}Content`]) {
      computedValue = this[`${propName}Content`]();
    } else {
      staticValue = this.options[propName] !== undefined ? this.options[propName] : this[propName];
    }
    return { computedValue, invocationValue, staticValue };
  }
}
