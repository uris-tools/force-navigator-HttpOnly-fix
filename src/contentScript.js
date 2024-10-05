import { ui, sfCommander as forceCommander, sfCommanderSettings, _d } from './shared';
import { t } from 'lisan';

forceCommander.pasteFromClipboard = (newtab) => {
	let cb = document.createElement('textarea');
	let body = document.getElementsByTagName('body')[0];
	body.appendChild(cb);
	cb.select();
	document.execCommand('paste');
	const clipboardValue = cb.value.trim();
	cb.remove();
	return clipboardValue;
};
//Get Salesforce object ID from a SF URL
forceCommander.getIdFromUrl = () => {
	const url = document.location.href;
	const ID_RE = [
		/http[s]?\:\/\/.*force\.com\/.*([a-zA-Z0-9]{18})[^\w]*/, // tries to find the first 18 digit
		/http[s]?\:\/\/.*force\.com\/.*([a-zA-Z0-9]{15})[^\w]*/, // falls back to 15 digit
	];
	for (let i in ID_RE) {
		const match = url.match(ID_RE[i]);
		if (match != null) {
			return match[1];
		}
	}
	return false;
};
forceCommander.launchMerger = (otherId, object) => {
	if (!otherId) otherId = forceCommander.pasteFromClipboard();
	if (![15, 18].includes(otherId.length)) {
		ui.clearOutput();
		ui.addSearchResult('commands.errorAccountMerge');
		return;
	}
	const thisId = forceCommander.getIdFromUrl();
	if (!thisId) return;
	switch (object) {
		case 'Account':
			document.location.href = `${forceCommander.serverInstance}/merge/accmergewizard.jsp?goNext=+Next+&cid=${otherId}&cid=${thisId}`;
			break;
		default:
			break;
	}
};
forceCommander.launchMergerAccounts = (otherId) => forceCommander.launchMerger(otherId, 'Account');
forceCommander.launchMergerCases = (otherId) => forceCommander.launchMerger(otherId, 'Case');
forceCommander.createTask = (subject) => {
	ui.showLoadingIndicator();
	if (['', null, undefined].includes(subject) && !forceCommander.userId) {
		console.error('Empty Task subject');
		hideLoadingIndicator();
		return;
	}
	chrome.runtime.sendMessage(
		{
			action: 'createTask',
			apiUrl: forceCommander.apiUrl,
			sessionId: forceCommander.sessionId,
			domain: forceCommander.serverInstance,
			subject: subject,
			userId: forceCommander.userId,
		},
		(response) => {
			if (response.errors.length != 0) {
				console.error('Error creating task', response.errors);
				return;
			}
			ui.clearOutput();
			forceCommander.commands['commands.goToTask'] = {
				key: 'commands.goToTask',
				url: forceCommander.serverInstance + '/' + response.id,
			};
			ui.quickSearch.value = '';
			ui.addSearchResult('commands.goToTask');
			ui.addSearchResult('commands.escapeCommand');
			let firstEl = document.querySelector('#sfnavOutputs :first-child');
			if (forceCommander.listPosition == -1 && firstEl != null) firstEl.className = 'sfnav_child sfnav_selected';
			ui.hideLoadingIndicator();
		}
	);
};

forceCommander.init();
