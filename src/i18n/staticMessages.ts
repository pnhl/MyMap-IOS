// Static catalogs are loaded only when their language is selected.
export function loadMessages(code:string):Record<string,string>{
 switch(code){
 case 'en': return require('./messages/en.json');
 case 'ar': return require('./messages/ar.json');
 case 'zh': return require('./messages/zh.json');
 case 'cs': return require('./messages/cs.json');
 case 'nl': return require('./messages/nl.json');
 case 'fr': return require('./messages/fr.json');
 case 'de': return require('./messages/de.json');
 case 'el': return require('./messages/el.json');
 case 'he': return require('./messages/he.json');
 case 'hi': return require('./messages/hi.json');
 case 'it': return require('./messages/it.json');
 case 'ja': return require('./messages/ja.json');
 case 'kk': return require('./messages/kk.json');
 case 'ko': return require('./messages/ko.json');
 case 'pl': return require('./messages/pl.json');
 case 'pt': return require('./messages/pt.json');
 case 'ru': return require('./messages/ru.json');
 case 'es': return require('./messages/es.json');
 case 'tl': return require('./messages/tl.json');
 default: return {};
 }
}
