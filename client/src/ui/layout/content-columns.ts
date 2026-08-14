import './content-columns.css';

/**
 * What a section says about the values it holds, from which the minimum band
 * width follows. The caller states this and nothing else: it cannot know the
 * width it will be given, so it never states a count, a track template or a
 * length.
 */
export type ContentClass = 'short-scalar' | 'long-single-line' | 'free-text';

/** Whether a band carries a label beside its value, or the value alone. */
export type BandForm = 'pair' | 'value';

/**
 * The library's one answer to "how many of these fit here": as many bands of at
 * least the content class's minimum as the container's own box can hold. The
 * minima, the maxima and the gap live with the library's other design values
 * (`tokens.css`); the rule itself lives in `content-columns.css`.
 */
export function contentColumnsClassName(form: BandForm, contentClass: ContentClass): string {
  return `ui-content-columns ui-content-columns--${form}-${contentClass}`;
}
