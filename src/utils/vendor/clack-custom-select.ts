// Vendored and adjusted from: https://github.com/natemoo-re/clack/blob/593f93d06c1a53c8424e9aaf0c1c63fbf6975527/packages/prompts/src/index.ts
// Upstream PR: https://github.com/natemoo-re/clack/pull/129

// MIT License

// Copyright (c) Nate Moore

// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// ---

// `ansi-regex` is adapted from https://github.com/chalk/ansi-regex

// MIT License

// Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// ---

// @ts-ignore
import * as clackCore from '@clack/core';
import color from 'picocolors';
import { isUnicodeSupported } from './is-unicorn-supported';

const unicode = isUnicodeSupported();
const s = (c: string, fallback: string) => (unicode ? c : fallback);

const S_RADIO_ACTIVE = s('●', '>');
const S_RADIO_INACTIVE = s('○', ' ');
const S_BAR = s('│', '|');

const S_STEP_ACTIVE = s('◆', '*');
const S_STEP_CANCEL = s('■', 'x');
const S_STEP_ERROR = s('▲', 'x');
const S_STEP_SUBMIT = s('◇', 'o');
const S_BAR_END = s('└', '—');

const symbol = (state: string) => {
  switch (state) {
    case 'initial':
    case 'active':
      return color.cyan(S_STEP_ACTIVE);
    case 'cancel':
      return color.red(S_STEP_CANCEL);
    case 'error':
      return color.yellow(S_STEP_ERROR);
    case 'submit':
      return color.green(S_STEP_SUBMIT);
  }
};

type Primitive = Readonly<string | boolean | number>;
type Option<Value> = Value extends Primitive
  ? { value: Value; label?: string; hint?: string }
  : { value: Value; label: string; hint?: string };
export interface SelectOptions<Options extends Option<Value>[], Value> {
  message: string;
  options: Options;
  initialValue?: Value;
  maxItems?: number;
}

/**
 * Like the normal clack select prompt but with a `maxItems` option.
 */
export const windowedSelect = <Options extends Option<Value>[], Value>(
  opts: SelectOptions<Options, Value>,
) => {
  const opt = (
    option: Option<Value>,
    state: 'inactive' | 'active' | 'selected' | 'cancelled',
  ) => {
    const label = option.label ?? String(option.value);
    if (state === 'active') {
      return `${color.green(S_RADIO_ACTIVE)} ${label} ${
        option.hint ? color.dim(`(${option.hint})`) : ''
      }`;
    } else if (state === 'selected') {
      return `${color.dim(label)}`;
    } else if (state === 'cancelled') {
      return `${color.strikethrough(color.dim(label))}`;
    }
    return `${color.dim(S_RADIO_INACTIVE)} ${color.dim(label)}`;
  };

  let slidingWindowLocation = 0;

  return new clackCore.SelectPrompt({
    options: opts.options,
    initialValue: opts.initialValue,
    render() {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      const title = `${color.gray(S_BAR)}\n${symbol(this.state)}  ${
        opts.message
      }\n`;
      switch (this.state) {
        case 'submit':
          return `${title}${color.gray(S_BAR)}  ${opt(
            this.options[this.cursor],
            'selected',
          )}`;
        case 'cancel':
          return `${title}${color.gray(S_BAR)}  ${opt(
            this.options[this.cursor],
            'cancelled',
          )}\n${color.gray(S_BAR)}`;
        default: {
          // We clamp to minimum 5 because anything less doesn't make sense UX wise
          const maxItems =
            opts.maxItems === undefined ? Infinity : Math.max(opts.maxItems, 5);
          if (this.cursor >= slidingWindowLocation + maxItems - 3) {
            slidingWindowLocation = Math.max(
              Math.min(
                this.cursor - maxItems + 3,
                this.options.length - maxItems,
              ),
              0,
            );
          } else if (this.cursor < slidingWindowLocation + 2) {
            slidingWindowLocation = Math.max(this.cursor - 2, 0);
          }

          const shouldRenderTopEllipsis =
            maxItems < this.options.length && slidingWindowLocation > 0;
          const shouldRenderBottomEllipsis =
            maxItems < this.options.length &&
            slidingWindowLocation + maxItems < this.options.length;

          return `${title}${color.cyan(S_BAR)}  ${this.options
            .slice(slidingWindowLocation, slidingWindowLocation + maxItems)
            .map((option, i, arr) => {
              if (i === 0 && shouldRenderTopEllipsis) {
                return color.dim('...');
              } else if (i === arr.length - 1 && shouldRenderBottomEllipsis) {
                return color.dim('...');
              } else {
                return opt(
                  option,
                  i + slidingWindowLocation === this.cursor
                    ? 'active'
                    : 'inactive',
                );
              }
            })
            .join(`\n${color.cyan(S_BAR)}  `)}\n${color.cyan(S_BAR_END)}\n`;
        }
      }
    },
  }).prompt() as Promise<Value | symbol>;
};
