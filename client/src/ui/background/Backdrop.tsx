import backdropAsset from './backdrop-asset.svg';
import './backdrop.css';

/**
 * Fixed, full-viewport backdrop layer. Renders the static, pre-blurred
 * background asset once; nothing here is animated or recomputed at runtime.
 */
export function Backdrop() {
  return (
    <div className="ui-backdrop">
      <img className="ui-backdrop__image" src={backdropAsset} alt="" />
    </div>
  );
}
