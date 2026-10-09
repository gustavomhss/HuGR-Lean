import './style.css';
import icon from './icon.svg';
document.querySelector('#app').innerHTML = `<img src="${icon}" alt="native asset">`;
import('./lazy.js').then(({ message }) => document.querySelector('#app').append(message));
