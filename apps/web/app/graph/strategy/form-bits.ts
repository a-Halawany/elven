/**
 * Re-exports of the shared control styles this screen uses.
 *
 * It exists so the Strategy form imports one module rather than reaching into two
 * component files for a handful of style constants — the styles themselves are
 * the shared ones and are not redefined here.
 */
export { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';
export { textareaStyle as textareaStyleFallback } from '../../../components/observation';
