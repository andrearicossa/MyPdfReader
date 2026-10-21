import { render } from 'preact';
import { App } from './ui/App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/reader.css';
import './styles/annotations.css';
import { registerPwa } from './pwa/register';

render(<App />, document.getElementById('app')!);
registerPwa();
