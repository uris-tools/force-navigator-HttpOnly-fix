import { lisan, t } from 'lisan';
import Mousetrap from 'mousetrap';
lisan.add(require(`./languages/en-US.js`));

export const _d = (exception, message = '') => {
	console.error('_D(' + message + '):');
	exception && exception.name && console.error(`ERROR:   ${exception.name}: ${exception.message}`);
	exception && console.error('ERROR parameters:', ...(exception[Symbol.iterator] ? exception : [exception]));
	console.error('ERROR trace:', exception);
	console.trace();
	console.error('_D() ---------------------');
};

const DEBUG_LEVEL = 3; //0=none, 1=warnings, 2=info, 3=debug

export const debugLog = (level, ...args) => {
	if (level <= DEBUG_LEVEL) {
		const spaces = ' '.repeat(level * 3);
		console.debug(spaces, ...args);
	}
};

console.info('sfCommander Loaded with target ' + __BROWSER__ + ',Debug Level ' + DEBUG_LEVEL);

const inputHandler = (function (m) {
	var _global_callbacks = {},
		_original_stop_callback = m.stopCallback;
	m.stopCallback = function (e, element, combo) {
		if (_global_callbacks[combo]) {
			return false;
		}
		return _original_stop_callback(e, element, combo);
	};
	m.bindGlobal = function (keys, callback, action) {
		m.bind(keys, callback, action);
		if (keys instanceof Array) {
			for (var i = 0; i < keys.length; i++) {
				_global_callbacks[keys[i]] = true;
			}
			return;
		}
		_global_callbacks[keys] = true;
	};
	return m;
})(Mousetrap);

//lookup modes:
export const LOOKUP_MODE_SHOW_COMMANDS = 1; //when any command is entered, show the commands completion options
export const LOOKUP_MODE_SHOW_SEARCH_RESULTS = 2; //When query contains an object and value to search --> show results

export const ui = {
	searchBox: null,
	navOutput: null,
	quickSearch: null,
	navLoader: null,
	createBox: () => {
		if (!document.body) return false;
		let theme = sfCommanderSettings.theme;
		let div = document.createElement('div');
		div.setAttribute('id', 'sfnavStyleBox');
		div.setAttribute('class', theme);
		const loaderURL = chrome.runtime.getURL('images/ajax-loader.gif');
		const logoURL = chrome.runtime.getURL('images/sf-commander128.png');
		div.innerHTML = `
<div id="sfnavSearchBox">
	<div class="sfnav_wrapper">
		<input type="text" id="sfnavQuickSearch" autocomplete="off"/>
		<img id="sfnavLoader" src= "${loaderURL}"/>
		<img id="sfnav_logo" src= "${logoURL}"/>
	</div>
	<div class="sfnav_shadow" id="sfnav_shadow"/>
	<div class="sfnavOutput" id="sfnavOutput"/>
</div>`;
		document.body.appendChild(div);
		ui.searchBox = document.getElementById('sfnavSearchBox');
		ui.navOutput = document.getElementById('sfnavOutput');
		ui.quickSearch = document.getElementById('sfnavQuickSearch');
		ui.navLoader = document.getElementById('sfnavLoader');
	},
	mouseHandler: (e) => {
		e.target.classList.add('sfnav_selected');
		return true;
	},
	mouseClick: (e) => {
		document.getElementById('sfnavQuickSearch').value = e.target.firstChild.nodeValue;
		sfCommander.listPosition = -1;
		ui.setVisibleSearch('hidden');
		if (e.target.dataset.key & !window.ctrlKey) sfCommander.invokeCommand(e.target.dataset, window.ctrlKey, 'click');
		else ui.hideSearchBox();
		return true;
	},
	mouseHandlerOut: (e) => {
		e.target.classList.remove('sfnav_selected');
		return true;
	},
	mouseClickLoginAs: (e) => {
		sfCommander.loginAsPerform(e.target.dataset.key.replace('commands.loginAs.', ''));
		return true;
	},
	bindShortcuts: () => {
		if (!ui.quickSearch) return false;
		inputHandler.bindGlobal('esc', function (e) {
			ui.hideSearchBox();
		}); // global doesn't seem to be working
		inputHandler(ui.quickSearch).bind('esc', function (e) {
			ui.hideSearchBox();
		});
		inputHandler(ui.quickSearch).bind('enter', ui.kbdCommand);
		inputHandler(ui.quickSearch).bind('tab', ui.kbdCommand);
		for (var i = 0; i < sfCommander.newTabKeys.length; i++) {
			inputHandler(ui.quickSearch).bind(sfCommander.newTabKeys[i], ui.kbdCommand);
		}
		inputHandler(ui.quickSearch).bind('down', ui.selectMove.bind(this, 'down'));
		inputHandler(ui.quickSearch).bind('up', ui.selectMove.bind(this, 'up'));
		inputHandler(ui.quickSearch).bind('backspace', function (e) {
			sfCommander.listPosition = -1;
		});
		ui.quickSearch.oninput = ui.lookupCommands;
		ui.quickSearch.onfocus = ui.lookupCommands;
	},
	showLoadingIndicator: () => {
		if (ui.navLoader) ui.navLoader.style.visibility = 'visible';
	},
	hideLoadingIndicator: () => {
		if (ui.navLoader) ui.navLoader.style.visibility = 'hidden';
	},
	hideSearchBox: () => {
		ui.quickSearch.blur();
		ui.clearOutput();
		ui.quickSearch.value = '';
		ui.setVisibleSearch('hidden');
	},
	setVisibleSearch: (visibility) => {
		if (visibility == 'hidden') {
			ui.searchBox.style.opacity = 0;
			ui.searchBox.style.zIndex = -1;
		} else {
			ui.searchBox.style.opacity = 0.98;
			ui.searchBox.style.zIndex = 9999;
			ui.quickSearch.focus();
		}
	},
	//lookupMode decides what is displayed in the dropdown (command completion, help text, or search resutls)
	lookupMode: LOOKUP_MODE_SHOW_COMMANDS, //Default is to show command completion
	lookupCommands: () => {
		let input = ui.quickSearch.value;
		if (input == '') {
			ui.clearOutput();
			chrome.runtime.sendMessage(
				{
					action: 'getCommandsHistory',
					orgId: sfCommander.organizationId,
				},
				(response) => {
					if (response.commandsHistory)
						for (let i = response.commandsHistory.length - 1; i >= 0; i--) {
							const key = response.commandsHistory[i][0];
							const url = response.commandsHistory[i][1];
							ui.searchResults.push({ url: url, label: key });
							ui.addSearchResult(key, url);
						}
				}
			);
			return;
		}
		ui.clearOutput();
		if (input.substring(0, 1) == '?') {
			input = input.replace(/^\?\s*/, '');
			//Handle search.
			//Syntax - ? sobject value
			//example: ? account sony
			//         ? case "not working"
			//check if the search command is complete (has sobject and value to search)
			if (input.match(/"/g)?.length % 2 == 1) {
				//if number of " is odd, add another one at the end.  This way '? "account brand" '  can work
				input += '"';
			}
			let searchQuery = input.split(/([^\s"]+|"[^"]*")+/g).filter((value) => value != ' ' && value != '');
			ui.lookupMode = LOOKUP_MODE_SHOW_SEARCH_RESULTS;
			ui.loadCompactLayoutIfNeeded(searchQuery[0]?.toLowerCase());
			ui.debounceGetMoreData();
			return;
		}
		ui.lookupMode = LOOKUP_MODE_SHOW_COMMANDS;
		if (input.substring(0, 1) == '!') ui.addSearchResult('menu.createTask');
		else {
			let words = ui.filterCommandList(input);
			if (words.length > 0) for (var i = 0; i < words.length; ++i) ui.addSearchResult(words[i]);
			else sfCommander.listPosition = -1;
		}
		let firstEl = ui.navOutput.querySelector(':first-child');
		if (sfCommander.listPosition == -1 && firstEl != null) firstEl.className = 'sfnav_child sfnav_selected';
		ui.debounceGetMoreData();
	},
	//filterCommandList takes input ("case field") and returns an array of all matching commands
	filterCommandList: (input) => {
		if (typeof input === 'undefined' || input == '') return [];
		input = input.toLowerCase();
		let preSort = {},
			terms = input.toLowerCase().split(' ');
		for (const key in sfCommander.commands) {
			const label = sfCommander.commands[key]?.label ?? '';
			const comboSearch = (key + '|' + label).toLowerCase();
			if (comboSearch.indexOf(input) != -1) {
				preSort[key] = 0;
			} else {
				let match = 0;
				let sortValue = 0;

				for (let i = 0; i < terms.length; i++) {
					if (comboSearch.indexOf(terms[i]) != -1) {
						match++;
						let indexOfExtraDetails = label.indexOf('>>');
						if (indexOfExtraDetails > 0) {
							let part1Length = indexOfExtraDetails;
							let part2Length = label.length - indexOfExtraDetails - 2;
							sortValue = part1Length + part2Length / Math.pow(10, part2Length.toString().length);
						} else {
							sortValue = label.length;
						}
					}

					if (match == terms.length) {
						preSort[key] = sortValue;
					}
				}
			}
		}
		return Object.keys(preSort)
			.sort((a, b) => preSort[a] - preSort[b])
			.slice(0, sfCommanderSettings.searchLimit);
	},
	// Add one search result to dropdown
	addSearchResult: (key, url = '') => {
		if (url == '') {
			url = (sfCommander.commands[key]?.url ?? '#').replace('//', '/');
		}
		let r = document.createElement('a');
		r.setAttribute('href', url);
		r.setAttribute('data-key', key);
		r.classList.add('sfnav_child');
		r.onmouseover = ui.mouseHandler;
		r.onmouseout = ui.mouseHandlerOut;
		r.onclick = ui.mouseClick;
		let labelText;
		if (sfCommander.commands[key]?.label) {
			labelText = sfCommander.commands[key].label;
		} else {
			labelText = t(key);
		}
		r.appendChild(document.createTextNode(labelText));
		if (sfCommander.commands[key]?.userId) {
			r.setAttribute('data-userid', sfCommander.commands[key].userId);
			r.onclick = ui.mouseClickLoginAs;
		}
		ui.navOutput.appendChild(r);
	},
	searchResults: [],
	//clear and set the entire search results array
	setSearchResult: (searchResults) => {
		ui.clearOutput();
		searchResults.forEach((key) => {
			let r = document.createElement('a');
			r.setAttribute('href', key.url);
			r.classList.add('sfnav_child');
			r.onmouseover = ui.mouseHandler;
			r.onmouseout = ui.mouseHandlerOut;
			r.onclick = ui.mouseClick;
			if (key.label.length > 150) {
				r.classList.add('sfnav_child_smaller');
			}
			r.appendChild(document.createTextNode(key.label));
			ui.navOutput.appendChild(r);
		});
	},
	addError: (text) => {
		ui.clearOutput();
		let err = document.createElement('div');
		err.className = 'sfnav_child sfnav-error-wrapper';
		err.appendChild(document.createTextNode(t('prefix.error')));
		err.appendChild(document.createElement('br'));
		for (let i = 0; i < text.length; i++) {
			err.appendChild(document.createTextNode(text[i].message));
			err.appendChild(document.createElement('br'));
		}
		ui.searchBox.appendChild(err);
	},
	clearOutput: () => {
		ui.navOutput.innerHTML = '';
		sfCommander.listPosition = -1;
	},
	doSearch: (e) => {
		let options = {
			action: 'doSearch',
			searchQuery: e.target.value,
			apiUrl: sfCommander.apiUrl,
			labelToSobjectMapping: sfCommander.labelToSobjectMapping,
			compactLayoutFieldsForSobject: sfCommander.compactLayoutFieldsForSobject,
			sessionId: sfCommander.sessionId,
		};
		chrome.runtime.sendMessage(options, (response) => {
			if (response && response.error) {
				console.error('error in search: ' + response.error);
				return;
			}
			try {
				if (response) {
					//Update mainFields
					if (response.mainFields != undefined) {
						sfCommander.compactLayoutFieldsForSobject[response.objectApiName] = response.mainFields;
					}
					//If only one result was returned, jump to that record directly:
					if (response.searchRecords.length == 1) {
						let oneResult = response.searchRecords[0];
						let url = `/lightning/r/${oneResult.attributes.type}/${oneResult.Id}/view`;
						//Add the command to 'recent commands' list
						let desc = '';
						Object.keys(oneResult).forEach(function (key) {
							let val = oneResult[key];
							console.debug('Oneresult ', val, 'type ', typeof val);
							if (key != 'Id' && ((typeof val == 'string' && !val.match('[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}')) || typeof val == 'number'))
								desc += oneResult[key] + ' - ';
						});
						desc = desc.slice(0, -3);
						chrome.runtime.sendMessage({
							action: 'updateLastCommand',
							orgId: sfCommander.organizationId,
							key: desc,
							url: url,
						});
						sfCommander.goToUrl(url);
						return;
					}
					sfCommander.listPosition = -1;
					ui.quickSearch.focus();
					ui.searchResults = [];
					Object.keys(response.searchRecords).forEach(function (key) {
						let oneResult = response.searchRecords[key];
						let desc = '';
						Object.keys(oneResult).forEach(function (key) {
							let val = oneResult[key];
							if (key != 'Id' && ((typeof val == 'string' && !val.match('[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}')) || typeof val == 'number'))
								desc += oneResult[key] + ' - ';
						});
						desc = desc.slice(0, -3);
						let url = `/lightning/r/${oneResult.attributes.type}/${oneResult.Id}/view`;
						ui.searchResults.push({ url: url, label: desc });
					});
					ui.setSearchResult(ui.searchResults);
				} else {
					console.error('no response from doSearch');
				}
			} catch (e) {
				_d([e, response]);
			}
		});
	},
	loadCompactLayoutIfNeeded: (sobject) => {
		if (sfCommander.compactLayoutFieldsForSobject[sobject] == undefined) {
			//load main fields for this object in the background
			let options = {
				action: 'loadCompactLayoutForSobject',
				apiUrl: sfCommander.apiUrl,
				sessionId: sfCommander.sessionId,
				sobject: sobject,
				compactLayoutFieldsForSobject: sfCommander.compactLayoutFieldsForSobject,
			};
			chrome.runtime.sendMessage(options, (response) => {
				if (response?.mainFields != undefined) {
					sfCommander.compactLayoutFieldsForSobject[sobject] = response.mainFields;
				}
			});
		}
	},
	kbdCommand: (e, keyPress) => {
		//kbdCommand is called when enter/ctrl+enter/command+enter/shift+enter/TAB is pressed
		//If enter is pressed:
		//   in case of a command, do the selected command
		//	 in case of a partial search (? and an object name), expand the possible objects (? prod --> ? product)
		//   in case of search, do the search.  If a search was already done and the user chose a result, go to it's URL
		//If TAB is pressed:
		//   in case of a search, try to expand the object
		//	 in case of a partial search (? and an object name), expand the possible objects (? prod --> ? product)
		//   in case of a command, try to expand meta data (load fields for objects, report names for reports, etc)

		// translate the text entered to command from the dropdown , if exists:
		let cmdKey = ui.navOutput.childNodes[sfCommander.listPosition < 0 ? 0 : sfCommander.listPosition]?.dataset;
		let details = e.target;
		console.log('>>>kbdCommand :    KeyPressed: ', keyPress, ', Key:', cmdKey, ' details: ', details, ' value: ', e.target?.value, ' lookupMode: ' + ui.lookupMode);

		if (keyPress == 'tab') {
			//Tab pressed.  Two options:   if this is a search (search strinwith a ?), expand fields
			//otherwise, try to get more info on the currently selected object
			switch (ui.lookupMode) {
				case LOOKUP_MODE_SHOW_SEARCH_RESULTS:
					console.debug('Trying to expand the search objects');
					return false;
				case LOOKUP_MODE_SHOW_COMMANDS:
					ui.debounceGetMoreData(true);
					return false;
			}
		}
		//Enter / ctrl-enter / shift-enter pressed
		if (['!'].includes(e.target.value[0])) cmdKey = { key: 'commands.createTask' };
		if (!cmdKey?.key?.startsWith('commands.loginAs.') && e.target.value.toLowerCase().includes(t('prefix.loginAs').toLowerCase())) {
			cmdKey = 'commands.loginAs';
			//details = ui.quickSearch.value
		}
		console.log('cmdKey:', cmdKey, 'details:', details);
		switch (ui.lookupMode) {
			case LOOKUP_MODE_SHOW_SEARCH_RESULTS:
				//Search mode
				if (sfCommander.listPosition >= 0) {
					let selectedResult = ui.searchResults[sfCommander.listPosition];
					if (selectedResult && selectedResult?.url) {
						let newTab = sfCommander.newTabKeys.indexOf(keyPress) >= 0 ? true : false;
						if (!newTab) ui.clearOutput();
						//Add the command to 'recent commands' list
						chrome.runtime.sendMessage({
							action: 'updateLastCommand',
							orgId: sfCommander.organizationId,
							key: selectedResult.label,
							url: selectedResult.url,
						});
						sfCommander.goToUrl(selectedResult.url, newTab);
					}
					return false;
				}
				ui.doSearch(e);
				return;
			case LOOKUP_MODE_SHOW_COMMANDS:
				if (e.target.value == '') {
					//Nothing entered on the input box.  going to a record from the history list
					let selectedResult = ui.searchResults[sfCommander.listPosition];
					if (selectedResult && selectedResult?.url) {
						let newTab = sfCommander.newTabKeys.indexOf(keyPress) >= 0 ? true : false;
						if (!newTab) ui.clearOutput();
						sfCommander.goToUrl(selectedResult.url, newTab);
					}
				}
				let newTab = sfCommander.newTabKeys.indexOf(keyPress) >= 0 ? true : false;
				if (!newTab) ui.clearOutput();
				sfCommander.invokeCommand(cmdKey, newTab, details);
				break;
		}
	},
	selectMove: (direction) => {
		ui.debounceGetMoreData();
		let words = Array.from(ui.navOutput.childNodes).reduce((a, w) => a.concat([w.textContent]), []);
		let isLastPos =
			direction == 'down'
				? sfCommander.listPosition < words.length - 1 // is at the bottom
				: sfCommander.listPosition >= 0; // so direction = up, is at the top
		if (words.length > 0 && isLastPos) {
			sfCommander.listPosition = sfCommander.listPosition + (direction == 'down' ? 1 : -1);
			if (sfCommander.listPosition < 0) sfCommander.listPosition = 0;
			if (sfCommander.listPosition >= 0) {
				ui.navOutput.childNodes[sfCommander.listPosition + (direction == 'down' ? -1 : 1)]?.classList.remove('sfnav_selected');
				ui.navOutput.childNodes[sfCommander.listPosition]?.classList.add('sfnav_selected');
				try {
					ui.navOutput.childNodes[sfCommander.listPosition]?.scrollIntoViewIfNeeded();
				} catch {
					ui.navOutput.childNodes[sfCommander.listPosition]?.scrollIntoView();
				}
				return false;
			}
		}
	},
	debounceTypingTimer: null,
	debounceGetMoreData: (tabPressed = false) => {
		//Call getMoreData with a dealy, so it will be called only when the user stopped typing
		clearTimeout(ui.debounceTypingTimer);
		if (tabPressed) {
			ui.getMoreData((tabPressed = true));
		} else {
			//get more
			ui.debounceTypingTimer = setTimeout(ui.getMoreData, 1000);
		}
	},
	getMoreData: (tabPressed = false) => {
		console.log('getmore. ui.lookupMode=' + ui.lookupMode);

		let keyToExpand = undefined;
		if (ui.navOutput.childNodes.length == 0 && ui.quickSearch?.value?.length > 0) {
			//There in nothing in the lookup table, meaning there is no matching command.
			//It could be that the user entered a value that is not yet loaded, for example "Case > Fields CaseNumber".  Remove the last element, and see if "Case > Fields" is something
			//I can expand:
			let reducedCommand = ui.quickSearch.value.split(' ');
			reducedCommand.pop();
			reducedCommand = reducedCommand.join(' ');
			console.log("ui.getMoreData: No command selected: '" + ui.quickSearch.value + "'.  will try '" + reducedCommand + "'");
			let words = ui.filterCommandList(reducedCommand);
			if (words.length > 0) {
				keyToExpand = words[0];
			}
		} else {
			//The lookup table has some values.  take the selected/first one and try to get more data for it/
			let cmdKey = ui.navOutput.childNodes[sfCommander.listPosition < 0 ? 0 : sfCommander.listPosition]?.dataset;
			keyToExpand = cmdKey?.key;
		}
		if (keyToExpand == undefined) return;
		if (typeof sfCommander.commands[keyToExpand] != 'undefined') {
			let options = {
				action: 'getMoreData',
				sourceCommand: sfCommander.commands[keyToExpand],
				sessionHash: sfCommander.sessionHash,
				domain: sfCommander.serverInstance,
				serverUrl: sfCommander.serverUrl,
				apiUrl: sfCommander.apiUrl,
				key: sfCommander.organizationId,
				sessionId: sfCommander.sessionId,
			};
			chrome.runtime.sendMessage(options, (response) => {
				if (response && response.info) {
					console.info('info expanding: ' + response.info);
					return;
				}
				try {
					if (response) {
						Object.assign(sfCommander.commands, response);
						sfCommander.commands[keyToExpand].detailsAlreadyLoaded = 'Yes';
					} else {
						console.log('no response from getMoreData');
					}
					sfCommander.listPosition = -1;
					//update the quicksearch to have the new data appear, if the user pressed TAB. otherwise, just update the lookup values but don't change the text the user entered
					if (tabPressed) ui.quickSearch.value = sfCommander.commands[keyToExpand].label + ' > ';
					ui.quickSearch.focus();
					ui.lookupCommands();
				} catch (e) {
					_d([e, response]);
				}
			});
		}
	},
};

export const sfCommanderSettings = {
	MAX_SEARCH_RESULTS: 32,
	theme: 'theme-default',
	searchLimit: 16,
	commands: {},
	enhancedprofiles: true,
	developername: false,
	lightningMode: true,
	language: 'en-US',
	skipObjects: ['0DM'],
	availableThemes: ['Default', 'Dark', 'Unicorn', 'Solarized'],
	ignoreList: null, // ignoreList will be for filtering custom objects, will need an add, remove, and list call
	changeDictionary: (newLanguage) => lisan.add(require('./languages/' + newLanguage + '.js')),
	setTheme: (command) => {
		const newTheme = 'theme-' + command.replace('commands.themes', '').toLowerCase();
		document.getElementById('sfnavStyleBox').classList = [newTheme];
		sfCommanderSettings.set('theme', newTheme);
	},
	settingsOnly: () => JSON.parse(JSON.stringify(sfCommanderSettings)),
	set: (key, value) => {
		let s = {};
		s[key] = value;
		chrome.storage.sync.set(s, (response) => sfCommander.refreshAndClear());
	},
	loadSettings: () => {
		chrome.storage.sync.get(sfCommanderSettings, (settings) => {
			for (const k in settings) {
				sfCommanderSettings[k] = settings[k];
			}
			sfCommander.serverInstance = sfCommander.getServerInstance(sfCommanderSettings);
			if (sfCommanderSettings.theme) document.getElementById('sfnavStyleBox').classList = [sfCommanderSettings.theme];
			if (sfCommander.sessionId !== null) {
				return;
			}
			chrome.runtime.sendMessage(
				{
					action: 'getApiSessionId',
					serverUrl: sfCommander.serverUrl,
				},
				(response) => {
					if (chrome.runtime.lastError) {
						console.error('error response from getApiSessionId:', chrome.runtime.lastError);
						return;
					}
					if (response && response.error) {
						console.error('response', response, chrome.runtime.lastError);
						return;
					}
					try {
						sfCommander.sessionId = unescape(response.sessionId);
						sfCommander.userId = unescape(response.userId);
						sfCommander.organizationId = unescape(response.orgId);
						sfCommander.apiUrl = unescape(response.apiUrl);
						sfCommander.loadCommands(sfCommanderSettings);
					} catch (e) {
						_d([e, response]);
					}
					ui.hideLoadingIndicator();
				}
			);
		});
	},
};

export const sfCommander = {
	organizationId: null,
	userId: null,
	sessionId: null,
	sessionHash: null,
	serverInstance: null,
	serverUrl: null,
	apiUrl: null,
	apiVersion: 'v60.0',
	loaded: false,
	listPosition: -1,
	ctrlKey: false,
	newTabKeys: ['ctrl+enter', 'command+enter', 'shift+enter'],
	regMatchSid_Client: /sid_Client=([a-zA-Z0-9\.\!]+)/,
	otherExtensions: [
		{
			platform: 'chrome-extension',
			id: 'aodjmnfhjibkcdimpodiifdjnnncaafh',
			urlId: 'aodjmnfhjibkcdimpodiifdjnnncaafh',
			name: 'Salesforce Inspector',
			checkData: { message: 'getSfHost', url: location.href },
			commands: [
				{
					url: '/data-export.html?host=$APIURL',
					key: 'other.inspector.dataExport',
				},
				{
					url: '/inspect.html?host=$APIURL&objectType=$SOBJECT&recordId=$RECORDID',
					key: 'other.inspector.showAllData',
				},
			],
		},
		{
			platform: 'moz-extension',
			id: 'jid1-DBcuAQpfLMcvOQ@jetpack',
			urlId: '84da8919-e6e9-4aae-ac9c-7f68b87003a1',
			name: 'Salesforce Inspector',
			checkData: { message: 'getSfHost', url: location.href },
			commands: [
				{
					url: '/data-export.html?host=$APIURL',
					key: 'other.inspector.dataExport',
				},
				{
					url: '/inspect.html?host=$APIURL&objectType=$SOBJECT&recordId=$RECORDID',
					key: 'other.inspector.showAllData',
				},
			],
		},
	],
	commands: {},
	customObjectsIds: {},
	labelToSobjectMapping: {},
	compactLayoutFieldsForSobject: {}, //for each object, what are the most important fields to display it. taken from the conmpact layout
	init: () => {
		try {
			document.onkeyup = (ev) => {
				window.ctrlKey = ev.ctrlKey;
			};
			document.onkeydown = (ev) => {
				window.ctrlKey = ev.ctrlKey;
			};
			try {
				sfCommander.serverInstance = sfCommander.getServerInstance(sfCommanderSettings);
				sfCommander.organizationId = sfCommander.serverInstance || sfCommander.organizationId;
				sfCommander.sessionHash = sfCommander.getSessionHash();
			} catch (e) {
				//No data.  probably before login page.
				console.info('No cookie information.  Probably before login page');
				return;
			}

			sfCommanderSettings.loadSettings();
			lisan.setLocaleName(sfCommanderSettings.language);
			sfCommander.resetCommands();
			ui.createBox();
			ui.bindShortcuts();
			if (sfCommanderSettings.enhancedprofiles) {
				delete sfCommander.commands['setup.profiles'];
			} else {
				delete sfCommander.commands['setup.enhancedProfiles'];
			}
			console.info('init complete');
		} catch (e) {
			_d(e);
		}
	},
	createSObjectCommands: (commands, sObjectData, serverUrl, customObjectsIds) => {
		const { labelPlural, label, name, keyPrefix } = sObjectData;
		const mapKeys = Object.keys(sfCommander.objectSetupLabelsMap);
		if (!keyPrefix || sfCommanderSettings.skipObjects.includes(keyPrefix)) {
			return commands;
		}
		let baseUrl = '';
		if (sfCommanderSettings.lightningMode && name.endsWith('__mdt')) {
			baseUrl += '/lightning/setup/CustomMetadata/page?address=';
		}
		commands[keyPrefix + '.list'] = {
			key: keyPrefix + '.list',
			url: `${baseUrl}/${keyPrefix}`,
			label: t('prefix.list') + ' ' + labelPlural,
			apiname: name,
		};
		commands[keyPrefix + '.new'] = {
			key: keyPrefix + '.new',
			url: `${baseUrl}/${keyPrefix}/e`,
			label: t('prefix.new') + ' ' + label,
			apiname: name,
		};
		if (sfCommanderSettings.lightningMode) {
			//TODO: targetURL should use ID not name
			let guiId = name;
			if (name in customObjectsIds) {
				guiId = customObjectsIds[name];
				//console.debug('Using custom object ID for ', name, ' : ', guiId);
			}
			let targetUrl = serverUrl + '/lightning/setup/ObjectManager/' + guiId;
			mapKeys.forEach((key) => {
				commands[keyPrefix + '.' + key] = {
					key: keyPrefix + '.' + key,
					url: targetUrl + sfCommander.objectSetupLabelsMap[key],
					label: [t('prefix.setup'), label, t(key)].join(' > '),
					apiname: name,
				};
				if (name in customObjectsIds) commands[keyPrefix + '.' + key]['guiId'] = guiId;
			});
		} else {
			// TODO maybe figure out how to get the url for Classic
			commands[t('prefix.setup') + label] = { url: keyPrefix, key: key };
		}
		return commands;
	},
	dumpToConsole: (command, event, sfCommanderSettings) => {
		console.info('DUMP:        ', event?.value);
		//console.info('	Command:', command);
		//console.info('	Event:', event);
		console.info('	session settings:', sfCommanderSettings);
		console.info('	server instance: ', sfCommander.serverInstance);
		console.info('	API Url: ', sfCommander.apiUrl);
		//Filter the dump: event?.value is the text the user entered.   assume the syntax "dump xxx yyy zzz" and show only lines that match
		//the filter parameters
		let parameters = event?.value?.split(' ');
		if (parameters) {
			parameters.shift();
		} else {
			parameters[0] = '';
		}

		console.info('	Commands that contain ', parameters, ':');
		let tempResultTable = [];
		let tempCount = 0;
		for (const key in sfCommander.commands) {
			const label = sfCommander.commands[key]?.label ?? '';
			const url = (sfCommander.commands[key]?.url ?? '').substring(0, 100);
			const apiname = (sfCommander.commands[key]?.apiname ?? '').substring(0, 20);
			const key_label_apiname = (key + label + url + apiname).toLowerCase();
			//If all elements of parameter[] appear in key_label_apiname, print it
			if (parameters.every((item) => key_label_apiname.includes(item))) {
				tempResultTable.push([label, sfCommander.commands[key]]);
				tempCount++;
			}
		}
		console.table(tempResultTable);
		console.info(tempCount + ' records dumped');
		console.info('	labelToSobjectMapping that contain ', parameters, ':');
		tempResultTable = [];
		tempCount = 0;
		for (const key in sfCommander.labelToSobjectMapping) {
			const val = sfCommander.labelToSobjectMapping[key];
			if (parameters.every((item) => (key + val).includes(item))) {
				tempResultTable.push([key, val]);
				tempCount++;
			}
		}
		console.table(tempResultTable);
		console.info(tempCount + ' records dumped');
	},
	invokeCommand: (command, newTab, event) => {
		if (!command && event?.value) {
			//if the command is not recognised. used the textbox value itself
			command = { key: event?.value };
		}
		console.log('invokeCommand (', command, ',', newTab, ',', event, ')');

		let targetUrl = '';
		if (typeof command != 'object') command = { key: command };
		if (typeof sfCommander.commands[command.key] != 'undefined' && sfCommander.commands[command.key].url) {
			targetUrl = sfCommander.commands[command.key].url;
			console.log('point 1. targetUrl: ', targetUrl, ' for command: ', command.key);
		}
		if (command.key?.startsWith('commands.loginAs.')) {
			sfCommander.loginAsPerform(command.key.replace('commands.loginAs.', ''), newTab);
			return true;
		} else if (command.key?.startsWith('commands.themes')) {
			sfCommanderSettings.setTheme(command.key);
			return true;
		} else if (command.key?.startsWith('other')) {
			switch (command.key) {
				case 'other.inspector.showAllData':
					const matching = location.href.match(/\/r\/([\w_]+)\/(\w+)/);
					const sObject = matching[1];
					const recordId = matching[2];
					targetUrl = sfCommander.commands[command.key].url.replace('$SOBJECT', sObject).replace('$RECORDID', recordId);
			}
		} else if (command.key.startsWith('dump')) {
			sfCommander.dumpToConsole(command, event, sfCommanderSettings);
			ui.hideSearchBox();
			return true;
		}
		//Add the command to 'recent commands' list
		chrome.runtime.sendMessage({
			action: 'updateLastCommand',
			orgId: sfCommander.organizationId,
			key: command.key,
			url: targetUrl,
		});
		switch (command.key) {
			case 'commands.refreshMetadata':
				sfCommander.refreshAndClear();
				return true;
				break;
			case 'commands.objectManager':
				targetUrl = sfCommander.serverInstance + '/lightning/setup/ObjectManager/home';
				break;
			case 'switch to classic':
			case 'switch to lightning':
			case 'commands.toggleLightning':
				let mode = sfCommanderSettings.lightningMode ? 'classic' : 'lex-campaign';
				const matchUrl = window.location.href.replace(window.location.origin, '');
				targetUrl = sfCommander.serverInstance + '/ltng/switcher?destination=' + mode + '&referrer=' + encodeURIComponent(matchUrl);
				sfCommanderSettings.lightningMode = mode === 'lex-campaign';
				sfCommanderSettings.set('lightningMode', sfCommanderSettings.lightningMode);
				break;
			case 'commands.toggleEnhancedProfiles':
				sfCommanderSettings.enhancedprofiles = !sfCommanderSettings.enhancedprofiles;
				sfCommanderSettings.set('enhancedprofiles', sfCommanderSettings.enhancedprofiles);
				return true;
				break;
			case 'commands.toggleDeveloperName':
				sfCommanderSettings.developername = !sfCommanderSettings.developername;
				sfCommanderSettings.set('developername', sfCommanderSettings.developername);
				return true;
				break;
			case 'commands.setup':
				targetUrl = sfCommander.serverInstance + (sfCommanderSettings.lightningMode ? '/lightning/setup/SetupOneHome/home' : '/ui/setup/Setup');
				break;
			case 'commands.home':
				targetUrl = sfCommander.serverInstance + '/';
				break;
			case 'commands.logout':
				targetUrl = sfCommander.serverInstance + '/secur/logout.jsp';
				break;
			case 'commands.help':
				chrome.runtime.sendMessage({ action: 'help' });
				ui.hideSearchBox();
				return true;
			case 'commands.toggleAllCheckboxes':
				Array.from(document.querySelectorAll('input[type="checkbox"]')).forEach((c) => (c.checked = c.checked ? false : true));
				ui.hideSearchBox();
				break;
			case 'commands.loginAs':
				sfCommander.loginAs(command, newTab);
				return true;
			case 'commands.mergeAccounts':
				sfCommander.launchMergerAccounts(command.value);
				break;
			case 'commands.createTask':
				sfCommander.createTask(ui.quickSearch.value.substring(1).trim());
				break;
			case 'commands.search':
				targetUrl = sfCommander.searchTerms(ui.quickSearch.value.substring(1).trim());
				break;
		}
		if (
			command.key
				.replace(/\d+/, '')
				.trim()
				.split(' ')
				.reduce((i, c) => {
					if ('set search limit'.includes(c)) return ++i;
					else return i;
				}, 0) > 1
		) {
			const newLimit = parseInt(command.replace(/\D+/, ''));
			if (newLimit != NaN && newLimit <= MAX_SEARCH_RESULTS) {
				sfCommanderSettings.searchLimit = newLimit;
				sfCommanderSettings.set('searchLimit', sfCommanderSettings.searchLimit).then((result) => ui.addSearchResult('notification.searchSettingsUpdated'));
				return true;
			} else ui.addError(t('error.searchLimitMax'));
		}
		if (!targetUrl) {
			console.error('No command match', command);
			return false;
		}
		ui.hideSearchBox();
		sfCommander.goToUrl(targetUrl, newTab, { command: command });
		return true;
	},
	resetCommands: () => {
		const modeUrl = sfCommanderSettings.lightningMode ? 'lightning' : 'classic';
		sfCommander.commands = {};
		Array(
			'commands.home',
			'commands.logout',
			'commands.setup',
			'commands.mergeAccounts',
			'commands.toggleAllCheckboxes',
			'commands.toggleLightning',
			'commands.help',
			'commands.objectManager',
			'commands.dumpDebug',
			'commands.setSearchLimit',
			'commands.loginAs',
			'commands.toggleEnhancedProfiles',
			'commands.refreshMetadata',
			'report.runReport',
			'report.editReport'
		)
			.filter((i) => i)
			.forEach((c) => {
				sfCommander.commands[c] = { key: c };
			});
		sfCommanderSettings.availableThemes.forEach(
			(th) =>
				(sfCommander.commands['commands.themes' + th] = {
					key: 'commands.themes' + th,
				})
		);
		Object.keys(sfCommander.urlMap).forEach((c) => {
			sfCommander.commands[c] = {
				key: c,
				url: sfCommander.urlMap[c][modeUrl],
				label: [t('prefix.setup'), t(c)].join(' > '),
			};
		});
	},
	searchTerms: (terms) => {
		// TODO doesn't work from a searched page in Lightning, SF just won't reparse the update URL because reasons, looks like they hijack the navigate event
		let searchUrl = sfCommander.serverInstance;
		searchUrl += !sfCommanderSettings.lightningMode
			? '/_ui/search/ui/UnifiedSearchResults?sen = ka&sen = 500&str=' + encodeURI(terms) + '#!/str=' + encodeURI(terms) + '&searchAll = true&initialViewMode = summary'
			: '/one/one.app?forceReload#' +
			  btoa(
					JSON.stringify({
						componentDef: 'forceSearch:search',
						attributes: {
							term: terms,
							scopeMap: { type: 'TOP_RESULTS' },
							context: {
								disableSpellCorrection: false,
								SEARCH_ACTIVITY: { term: terms },
							},
						},
					})
			  );
		return searchUrl;
	},
	getServerInstance: (settings = {}) => {
		let serverUrl;
		let url = location.origin + '';
		if (settings.lightningMode) {
			// if(url.indexOf("lightning.force") != -1)
			serverUrl = url.replace('lightning.force.com', '').replace('my.salesforce.com', '').replace('my.salesforce-setup.com', '') + 'lightning.force.com';
		} else {
			if (url.includes('salesforce')) serverUrl = url.substring(0, url.indexOf('salesforce')) + 'salesforce.com';
			else if (url.includes('cloudforce')) serverUrl = url.substring(0, url.indexOf('cloudforce')) + 'cloudforce.com';
			else if (url.includes('visual.force')) {
				let urlParseArray = url.split('.');
				serverUrl = urlParseArray[1] + '.salesforce.com';
			} else {
				serverUrl = url.replace('lightning.force.com', '') + 'my.salesforce.com';
			}
		}
		sfCommander.serverUrl = serverUrl;
		return serverUrl;
	},
	getSessionHash: () => {
		let sessionHash = document.cookie?.match(sfCommander.regMatchSid_Client)[1];
		return sessionHash;
	},
	getHTTP: (getUrl, type = 'json', headers = {}, data = {}, method = 'GET') => {
		let request = { method: method, headers: headers };
		if (Object.keys(data).length > 0) request.body = JSON.stringify(data);
		return fetch(getUrl, request)
			.then((response) => {
				sfCommander.apiUrl = response.url.match(/:\/\/(.*)salesforce.com/)[1] + 'salesforce.com';
				switch (type) {
					case 'json':
						return response.clone().json();
					case 'document':
						return response.clone().text();
				}
			})
			.then((data) => {
				if (typeof data == 'string') return new DOMParser().parseFromString(data, 'text/html');
				else return data;
			});
	},
	refreshAndClear: () => {
		ui.showLoadingIndicator();
		sfCommander.serverInstance = sfCommander.getServerInstance(sfCommander);
		sfCommander.loadCommands(sfCommanderSettings, true);
		sfCommander.labelToSobjectMapping = {};
		sfCommander.nameToLabelFieldMapping = {};
		sfCommander.compactLayoutFieldsForSobject = {};
		document.getElementById('sfnavQuickSearch').value = '';
	},
	loadCommands: (settings, force = false) => {
		if ([sfCommander.serverInstance, sfCommander.organizationId, sfCommander.sessionId].includes(null)) {
			return sfCommander.init();
		}
		if (force || Object.keys(sfCommander.commands).length === 0) sfCommander.resetCommands();
		let options = {
			sessionHash: sfCommander.sessionHash,
			domain: sfCommander.serverInstance,
			apiUrl: sfCommander.apiUrl,
			key: sfCommander.organizationId,
			force: force,
			sessionId: sfCommander.sessionId,
			serverUrl: sfCommander.serverUrl,
		};
		chrome.runtime.sendMessage(Object.assign(options, { action: 'getMetadata' }), (response) => Object.assign(sfCommander.commands, response));

		chrome.runtime.sendMessage(Object.assign(options, { action: 'getSobjectNameFields' }), (response) => {
			Object.assign(sfCommander.labelToSobjectMapping, response.labelToSobjectMapping);
		});
		chrome.runtime.sendMessage(Object.assign(options, { action: 'getActiveFlows' }), (response) => Object.assign(sfCommander.commands, response));
		sfCommander.otherExtensions
			.filter((e) => {
				return e.platform == (!!window.chrome ? 'chrome-extension' : 'moz-extension');
			})
			.forEach((e) =>
				chrome.runtime.sendMessage(
					Object.assign(options, {
						action: 'getOtherExtensionCommands',
						otherExtension: e,
					}),
					(r) => {
						return Object.assign(sfCommander.commands, r);
					}
				)
			);
		ui.hideLoadingIndicator();
	},
	goToUrl: (url, newTab, settings = {}) =>
		chrome.runtime.sendMessage(
			{
				action: 'goToUrl',
				url: url,
				newTab: newTab,
				settings: Object.assign(sfCommanderSettings.settingsOnly(), {
					serverInstance: sfCommander.serverInstance,
					lightningMode: sfCommanderSettings.lightningMode,
				}),
			},
			(response) => {}
		),
	loginAs: (cmd, newTab) => {
		let searchValue = ui.searchBox.querySelector('input').value.toLowerCase().replace(t('prefix.loginAs').toLowerCase(), '');
		if (![null, undefined, ''].includes(searchValue) && searchValue.length > 1) {
			ui.showLoadingIndicator();
			chrome.runtime.sendMessage(
				{
					action: 'searchLogins',
					apiUrl: sfCommander.apiUrl,
					sessionId: sfCommander.sessionId,
					domain: sfCommander.serverInstance,
					searchValue: searchValue,
					userId: sfCommander.userId,
				},
				(success) => {
					let numberOfUserRecords = success.records.length;
					ui.hideLoadingIndicator();
					if (numberOfUserRecords < 1) {
						ui.addError([{ message: 'No user for your search exists.' }]);
					} else if (numberOfUserRecords > 1) {
						sfCommander.loginAsShowOptions(success.records);
					} else {
						var userId = success.records[0].Id;
						sfCommander.loginAsPerform(userId, newTab);
					}
				}
			);
		}
	},
	loginAsShowOptions: (records) => {
		for (let i = 0; i < records.length; ++i) {
			sfCommander.commands['commands.loginAs.' + records[i].Id] = {
				key: 'commands.loginAs.' + records[i].Id,
				userId: records[i].Id,
				label: t('prefix.loginAs') + ' ' + records[i].Name,
			};
			ui.addSearchResult('commands.loginAs.' + records[i].Id);
		}
		let firstEl = document.querySelector('#sfnavOutput :first-child');
		if (firstEl != null) firstEl.className = 'sfnav_child sfnav_selected';
	},
	loginAsPerform: (userId, newTab) => {
		let targetUrl =
			'https://' +
			sfCommander.apiUrl +
			'/servlet/servlet.su?oid=' +
			sfCommander.organizationId +
			'&suorgadminid=' +
			userId +
			'&retURL=' +
			encodeURIComponent(window.location.pathname) +
			'&targetURL=' +
			encodeURIComponent(window.location.pathname) +
			'&';
		ui.hideSearchBox();
		console.log('login as url=' + targetUrl);
		if (newTab) sfCommander.goToUrl(targetUrl, true);
		else sfCommander.goToUrl(targetUrl);
		return true;
	},
	objectSetupLabelsMap: {
		'objects.details': '/Details/view',
		'objects.fieldsAndRelationships': '/FieldsAndRelationships/view',
		'objects.pageLayouts': '/PageLayouts/view',
		'objects.lightningPages': '/LightningPages/view',
		'objects.buttonsLinksActions': '/ButtonsLinksActions/view',
		'objects.compactLayouts': '/CompactLayouts/view',
		'objects.fieldSets': '/FieldSets/view',
		'objects.limits': '/Limits/view',
		'objects.recordTypes': '/RecordTypes/view',
		'objects.relatedLookupFilters': '/RelatedLookupFilters/view',
		'objects.searchLayouts': '/MySearchLayouts/view',
		'objects.triggers': '/ApexTriggers/view',
		'objects.lightningPages': '/LightningPages/view',
		'objects.validationRules': '/ValidationRules/view',
	},
	standardObjects: [
		{
			label: 'Account',
			name: 'Account',
			labelPlural: 'Accounts',
			keyPrefix: '001',
		},
		{
			label: 'Apex Class',
			name: 'ApexClass',
			labelPlural: 'Apex Classes',
			keyPrefix: '01p',
		},
		{
			label: 'Apex Trigger',
			name: 'ApexTrigger',
			labelPlural: 'Apex Triggers',
			keyPrefix: '01q',
		},
		{
			label: 'Asset Relationship',
			name: 'AssetRelationship',
			labelPlural: 'Asset Relationships',
			keyPrefix: '1AR',
		},
		{
			label: 'Asset',
			name: 'Asset',
			labelPlural: 'Assets',
			keyPrefix: '02i',
		},
		{
			label: 'Assignment Rule',
			name: 'AssignmentRule',
			labelPlural: 'Assignment Rules',
			keyPrefix: '01Q',
		},
		{
			label: 'Attachment',
			name: 'Attachment',
			labelPlural: 'Attachments',
			keyPrefix: '00P',
		},
		{
			label: 'Campaign',
			name: 'Campaign',
			labelPlural: 'Campaigns',
			keyPrefix: '701',
		},
		{ label: 'Case', name: 'Case', labelPlural: 'Cases', keyPrefix: '500' },
		{
			label: 'Contact',
			name: 'Contact',
			labelPlural: 'Contacts',
			keyPrefix: '003',
		},
		{
			label: 'Contract',
			name: 'Contract',
			labelPlural: 'Contracts',
			keyPrefix: '800',
		},
		{
			label: 'Customer',
			name: 'Customer',
			labelPlural: 'Customers',
			keyPrefix: '0o6',
		},
		{
			label: 'Dashboard',
			name: 'Dashboard',
			labelPlural: 'Dashboards',
			keyPrefix: '01Z',
		},
		{
			label: 'Document',
			name: 'Document',
			labelPlural: 'Documents',
			keyPrefix: '015',
		},
		{
			label: 'Duplicate Rule',
			name: 'DuplicateRule',
			labelPlural: 'Duplicate Rules',
			keyPrefix: '0Bm',
		},
		{
			label: 'Email Message',
			name: 'EmailMessage',
			labelPlural: 'Email Messages',
			keyPrefix: '02s',
		},
		{
			label: 'Email Template',
			name: 'EmailTemplate',
			labelPlural: 'Email Templates',
			keyPrefix: '00X',
		},
		{
			label: 'Event',
			name: 'Event',
			labelPlural: 'Events',
			keyPrefix: '00U',
		},
		{ label: 'Idea', name: 'Idea', labelPlural: 'Ideas', keyPrefix: '087' },
		{
			label: 'Individual',
			name: 'Individual',
			labelPlural: 'Individuals',
			keyPrefix: '0PK',
		},
		{
			label: 'Note (Content)',
			name: 'ContentNote',
			labelPlural: 'Notes',
			keyPrefix: '069',
		},
		{ label: 'Note', name: 'Note', labelPlural: 'Notes', keyPrefix: '002' },
		{
			label: 'Opportunity',
			name: 'Opportunity',
			labelPlural: 'Opportunities',
			keyPrefix: '006',
		},
		{
			label: 'Order',
			name: 'Order',
			labelPlural: 'Orders',
			keyPrefix: '801',
		},
		{
			label: 'Permission Set',
			name: 'PermissionSet',
			labelPlural: 'Permission Sets',
			keyPrefix: '0PS',
		},
		{
			label: 'Lead',
			name: 'Lead',
			labelPlural: 'People',
			keyPrefix: '00Q',
		},
		{
			label: 'Price Book',
			name: 'Pricebook2',
			labelPlural: 'Price Books',
			keyPrefix: '01s',
		},
		{
			label: 'Product',
			name: 'Product2',
			labelPlural: 'Products',
			keyPrefix: '01t',
		},
		{
			label: 'Profile',
			name: 'Profile',
			labelPlural: 'Profile',
			keyPrefix: '00e',
		},
		{
			label: 'Prompt Version',
			name: 'PromptVersion',
			labelPlural: 'Prompt Versions',
			keyPrefix: '0bt',
		},
		{
			label: 'Prompt',
			name: 'Prompt',
			labelPlural: 'Prompts',
			keyPrefix: '0bs',
		},
		{
			label: 'Quote',
			name: 'Quote',
			labelPlural: 'Quotes',
			keyPrefix: '0Q0',
		},
		{
			label: 'Report',
			name: 'Report',
			labelPlural: 'Reports',
			keyPrefix: '00O',
		},
		{
			label: 'Social Persona',
			name: 'SocialPersona',
			labelPlural: 'Social Personas',
			keyPrefix: '0SP',
		},
		{
			label: 'Solution',
			name: 'Solution',
			labelPlural: 'Solutions',
			keyPrefix: '501',
		},
		{
			label: 'Static Resource',
			name: 'StaticResource',
			labelPlural: 'Static Resources',
			keyPrefix: '081',
		},
		{
			label: 'Survey',
			name: 'Survey',
			labelPlural: 'Surveys',
			keyPrefix: '0Kd',
		},
		{ label: 'Task', name: 'Task', labelPlural: 'Tasks', keyPrefix: '00T' },
		{
			label: 'Topic',
			name: 'Topic',
			labelPlural: 'Topics',
			keyPrefix: '0TO',
		},
		{
			label: 'Visualforce Component',
			name: 'ApexComponent',
			labelPlural: 'Visualforce Components',
			keyPrefix: '099',
		},
		{
			label: 'Visualforce Page',
			name: 'ApexPage',
			labelPlural: 'Visualforce Pages',
			keyPrefix: '066',
		},
	],
	urlMap: {
		'setup.home': {
			lightning: '/lightning/page/home',
			classic: '//',
		},
		'setup.setup': {
			lightning: '',
			classic: '/ui/setup/Setup',
		},
		'setup.objectManager': {
			lightning: '/lightning/setup/ObjectManager/home',
			classic: '/p/setup/custent/CustomObjectsPage?setupid = CustomObjects&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDevTools',
		},
		'setup.profiles': {
			lightning: '/lightning/setup/Profiles/home',
			classic: '/00e?setupid = EnhancedProfiles&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DUsers',
		},
		'setup.searchLayouts': {
			lightning: '/lightning/setup/EinsteinSearchLayouts/home',
			classic: '/lightning/setup/ObjectManager/ContactPointPhone/SearchLayouts/view',
		},
		'setup.recordTypes': {
			lightning: '/lightning/setup/CollaborationGroupRecordTypes/home',
			classic: '/lightning/setup/ObjectManager/ContactPointAddress/RecordTypes/view',
		},
		'setup.releaseUpdates': {
			lightning: '/lightning/setup/ReleaseUpdates/home',
			classic: '/ui/setup/releaseUpdate/ReleaseUpdatePage?setupid = ReleaseUpdates&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DAdminSetup',
		},
		'setup.users': {
			lightning: '/lightning/setup/ManageUsers/home',
			classic: '/005?isUserEntityOverride = 1&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DUsers&setupid = ManageUsers',
		},
		'setup.roles': {
			lightning: '/lightning/setup/Roles/home',
			classic: '/ui/setup/user/RoleViewPage?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DUsers&setupid = Roles',
		},
		'setup.permissionSets': {
			lightning: '/lightning/setup/PermSets/home',
			classic: '/0PS?setupid = PermSets&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DUsers',
		},
		'setup.permissionSetGroups': {
			lightning: '/lightning/setup/PermSetGroups/home',
			classic: '/_ui/perms/ui/setup/PermSetGroupsPage?setupid = PermSetGroups&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DUsers',
		},
		'Public Groups': {
			lightning: '/lightning/setup/PublicGroups/home',
			classic: '/p/own/OrgPublicGroupsPage/d?setupid = PublicGroups&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DUsers',
		},
		'setup.queues': {
			lightning: '/lightning/setup/Queues/home',
			classic: '/p/own/OrgQueuesPage/d?setupid = Queues&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DUsers',
		},
		'setup.loginHistory': {
			lightning: '/lightning/setup/OrgLoginHistory/home',
			classic: '/0Ya?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DUsers&setupid = OrgLoginHistory',
		},
		'setup.identityVerificationHistory': {
			lightning: '/lightning/setup/VerificationHistory/home',
			classic: '/setup/secur/VerificationHistory.apexp?setupid = VerificationHistory&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DUsers',
		},
		'setup.companyInformation': {
			lightning: '/lightning/setup/CompanyProfileInfo/home',
			classic: '/00D41000000f27H?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCompanyProfile&setupid = CompanyProfileInfo',
		},
		'setup.fiscalYear': {
			lightning: '/lightning/setup/ForecastFiscalYear/home',
			classic: '/setup/org/orgfydetail.jsp?id = 00D41000000f27H&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCompanyProfile&setupid = ForecastFiscalYear',
		},
		'setup.businessHours': {
			lightning: '/lightning/setup/BusinessHours/home',
			classic: '/01m?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCompanyProfile&setupid = BusinessHours',
		},
		'setup.holidays': {
			lightning: '/lightning/setup/Holiday/home',
			classic: '/p/case/HolidayList?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCompanyProfile&setupid = Holiday',
		},
		'setup.languageSettings': {
			lightning: '/lightning/setup/LanguageSettings/home',
			classic: '/_ui/system/organization/LanguageSettings?setupid = LanguageSettings&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCompanyProfile',
		},
		'setup.healthCheck': {
			lightning: '/lightning/setup/HealthCheck/home',
			classic: '/_ui/security/dashboard/aura/SecurityDashboardAuraContainer?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSecurity&setupid = HealthCheck',
		},
		'setup.sharingSettings': {
			lightning: '/lightning/setup/SecuritySharing/home',
			classic: '/p/own/OrgSharingDetail?setupid = SecuritySharing&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSecurity',
		},
		'setup.fieldAccessibility': {
			lightning: '/lightning/setup/FieldAccessibility/home',
			classic: '/setup/layout/flslayoutjump.jsp?setupid = FieldAccessibility&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSecurity',
		},
		'setup.loginFlows': {
			lightning: '/lightning/setup/LoginFlow/home',
			classic: '/0Kq?setupid = LoginFlow&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSecurity',
		},
		'setup.activations': {
			lightning: '/lightning/setup/ActivatedIpAddressAndClientBrowsersPage/home',
			classic:
				'/setup/secur/identityconfirmation/ActivatedIpAddressAndClientBrowsersPage.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSecurity&setupid = ActivatedIpAddressAndClientBrowsersPage',
		},
		'setup.sessionManagement': {
			lightning: '/lightning/setup/SessionManagementPage/home',
			classic: '/setup/secur/session/SessionManagementPage.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSecurity&setupid = SessionManagementPage',
		},
		'setup.singleSignOnSettings': {
			lightning: '/lightning/setup/SingleSignOn/home',
			classic: '/_ui/identity/saml/SingleSignOnSettingsUi/d?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSecurity&setupid = SingleSignOn',
		},
		'setup.identityProvider': {
			lightning: '/lightning/setup/IdpPage/home',
			classic: '/setup/secur/idp/IdpPage.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSecurity&setupid = IdpPage',
		},
		'setup.viewSetupAuditTrail': {
			lightning: '/lightning/setup/SecurityEvents/home',
			classic: '/setup/org/orgsetupaudit.jsp?setupid = SecurityEvents&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSecurity',
		},
		'setup.delegatedAdministration': {
			lightning: '/lightning/setup/DelegateGroups/home',
			classic: '/ui/setup/user/DelegateGroupListPage?setupid = DelegateGroups&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSecurity',
		},
		'setup.remoteSiteSettings': {
			lightning: '/lightning/setup/SecurityRemoteProxy/home',
			classic: '/0rp?spl1 = 1&setupid = SecurityRemoteProxy&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSecurity',
		},
		'setup.cspTrustedSites': {
			lightning: '/lightning/setup/SecurityCspTrustedSite/home',
			classic: '/08y?spl1 = 1&setupid = SecurityCspTrustedSite&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSecurity',
		},
		'setup.namedCredentials': {
			lightning: '/lightning/setup/NamedCredential/home',
			classic: '/0XA?setupid = NamedCredential&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSecurity',
		},
		'setup.domains': {
			lightning: '/lightning/setup/DomainNames/home',
			classic: '/0I4?setupid = DomainNames&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDomains',
		},
		'setup.customURLs': {
			lightning: '/lightning/setup/DomainSites/home',
			classic: '/0Jf?setupid = DomainSites&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDomains',
		},
		'setup.myDomain': {
			lightning: '/lightning/setup/OrgDomain/home',
			classic: '/domainname/DomainName.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDomains&setupid = OrgDomain',
		},
		'setup.translationLanguageSettings': {
			lightning: '/lightning/setup/LabelWorkbenchSetup/home',
			classic: '/01h?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DLabelWorkbench&setupid = LabelWorkbenchSetup',
		},
		'setup.translate': {
			lightning: '/lightning/setup/LabelWorkbenchTranslate/home',
			classic: '/i18n/TranslationWorkbench.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DLabelWorkbench&setupid = LabelWorkbenchTranslate',
		},
		'setup.override': {
			lightning: '/lightning/setup/LabelWorkbenchOverride/home',
			classic: '/i18n/LabelWorkbenchOverride.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DLabelWorkbench&setupid = LabelWorkbenchOverride',
		},
		'setup.export': {
			lightning: '/lightning/setup/LabelWorkbenchExport/home',
			classic: '/i18n/TranslationExport.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DLabelWorkbench&setupid = LabelWorkbenchExport',
		},
		'setup.import': {
			lightning: '/lightning/setup/LabelWorkbenchImport/home',
			classic: '/i18n/TranslationImport.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DLabelWorkbench&setupid = LabelWorkbenchImport',
		},
		'setup.duplicateErrorLogs': {
			lightning: '/lightning/setup/DuplicateErrorLog/home',
			classic: '/075?setupid = DuplicateErrorLog&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDuplicateManagement',
		},
		'setup.duplicateRules': {
			lightning: '/lightning/setup/DuplicateRules/home',
			classic: '/0Bm?setupid = DuplicateRules&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDuplicateManagement',
		},
		'setup.matchingRules': {
			lightning: '/lightning/setup/MatchingRules/home',
			classic: '/0JD?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDuplicateManagement&setupid = MatchingRules',
		},
		'setup.dataIntegrationRules': {
			lightning: '/lightning/setup/CleanRules/home',
			classic: '/07i?setupid = CleanRules&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDataManagement',
		},
		'setup.dataIntegrationMetrics': {
			lightning: '/lightning/setup/XCleanVitalsUi/home',
			classic: '/_ui/xclean/ui/XCleanVitalsUi?setupid = XCleanVitalsUi&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDataManagement',
		},
		'setup.reportingSnapshots': {
			lightning: '/lightning/setup/AnalyticSnapshots/home',
			classic: '/_ui/analytics/jobs/AnalyticSnapshotSplashUi?setupid = AnalyticSnapshots&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDataManagement',
		},
		'setup.dataImportWizard': {
			lightning: '/lightning/setup/DataManagementDataImporter/home',
			classic: '/ui/setup/dataimporter/DataImporterAdminLandingPage?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDataManagement&setupid = DataManagementDataImporter',
		},
		'setup.salesforceNavigation': {
			lightning: '/lightning/setup/ProjectOneAppMenu/home',
			classic: '/setup/salesforce1AppMenu.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DMobileAdministration&setupid = ProjectOneAppMenu',
		},
		'setup.salesforceSettings': {
			lightning: '/lightning/setup/Salesforce1Settings/home',
			classic: '/mobile/mobileadmin/settingsMovedToConnectedApps.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSalesforce1&setupid = Salesforce1Settings',
		},
		'setup.salesforceBranding': {
			lightning: '/lightning/setup/Salesforce1Branding/home',
			classic: '/branding/setup/s1Branding.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSalesforce1&setupid = Salesforce1Branding',
		},
		'setup.outlookConfigurations': {
			lightning: '/lightning/setup/EmailConfigurations/home',
			classic: '/063?Type = E&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDesktopAdministration&setupid = EmailConfigurations',
		},
		'setup.emailToSalesforce': {
			lightning: '/lightning/setup/EmailToSalesforce/home',
			classic: '/email-admin/services/emailToSalesforceOrgSetup.apexp?mode = detail&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DEmailAdmin&setupid = EmailToSalesforce',
		},
		'setup.apexExceptionEmail': {
			lightning: '/lightning/setup/ApexExceptionEmail/home',
			classic: '/apexpages/setup/apexExceptionEmail.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DEmailAdmin&setupid = ApexExceptionEmail',
		},
		'setup.renameTabsAndLabels': {
			lightning: '/lightning/setup/RenameTab/home',
			classic: '/ui/setup/RenameTabPage?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DTab&setupid = RenameTab',
		},
		'setup.mapsAndLocationSettings': {
			lightning: '/lightning/setup/MapsAndLocationServicesSettings/home',
			classic: '/maps/mapsAndLocationSvcSettings.apexp?setupid = MapsAndLocationServicesSettings&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DMapsAndLocationServices',
		},
		'setup.taskFields': {
			lightning: '/lightning/setup/ObjectManager/Task/FieldsAndRelationships/view',
			classic: '/p/setup/layout/LayoutFieldList?type = Task&setupid = TaskFields&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity',
		},
		'setup.taskValidationRules': {
			lightning: '/lightning/setup/ObjectManager/Task/ValidationRules/view',
			classic: '/_ui/common/config/entity/ValidationFormulaListUI/d?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity&tableEnumOrId = Task&setupid = TaskValidations',
		},
		'setup.taskTriggers': {
			lightning: '/lightning/setup/ObjectManager/Task/Triggers/view',
			classic: '/p/setup/layout/ApexTriggerList?type = Task&setupid = TaskTriggers&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity',
		},
		'setup.taskButtons,Links,AndActions': {
			lightning: '/lightning/setup/ObjectManager/Task/ButtonsLinksActions/view',
			classic: '/p/setup/link/ActionButtonLinkList?pageName = Task&type = Task&setupid = TaskLinks&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity',
		},
		'setup.taskPageLayouts': {
			lightning: '/lightning/setup/ObjectManager/Task/PageLayouts/view',
			classic: '/ui/setup/layout/PageLayouts?type = Task&setupid = TaskLayouts&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity',
		},
		'setup.taskFieldSets': {
			lightning: '/lightning/setup/ObjectManager/Task/FieldSets/view',
			classic: '/_ui/common/config/entity/FieldSetListUI/d?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity&tableEnumOrId = Task&setupid = TaskFieldSets',
		},
		'setup.taskCompactLayouts': {
			lightning: '/lightning/setup/ObjectManager/Task/CompactLayouts/view',
			classic: '/_ui/common/config/compactlayout/CompactLayoutListUi/d?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity&type = Task&setupid = TaskCompactLayouts',
		},
		'setup.taskRecordTypes': {
			lightning: '/lightning/setup/ObjectManager/Task/RecordTypes/view',
			classic: '/ui/setup/rectype/RecordTypes?type = Task&setupid = TaskRecords&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity',
		},
		'setup.taskLimits': {
			lightning: '/lightning/setup/ObjectManager/Task/Limits/view',
			classic: '/p/setup/custent/EntityLimits?type = Task&setupid = TaskLimits&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity',
		},
		'setup.eventFields': {
			lightning: '/lightning/setup/ObjectManager/Event/FieldsAndRelationships/view',
			classic: '/p/setup/layout/LayoutFieldList?type = Event&setupid = EventFields&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity',
		},
		'setup.eventValidationRules': {
			lightning: '/lightning/setup/ObjectManager/Event/ValidationRules/view',
			classic: '/_ui/common/config/entity/ValidationFormulaListUI/d?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity&tableEnumOrId = Event&setupid = EventValidations',
		},
		'setup.eventTriggers': {
			lightning: '/lightning/setup/ObjectManager/Event/Triggers/view',
			classic: '/p/setup/layout/ApexTriggerList?type = Event&setupid = EventTriggers&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity',
		},
		'setup.eventPageLayouts': {
			lightning: '/lightning/setup/ObjectManager/Event/PageLayouts/view',
			classic: '/ui/setup/layout/PageLayouts?type = Event&setupid = EventLayouts&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity',
		},
		'setup.eventFieldSets': {
			lightning: '/lightning/setup/ObjectManager/Event/FieldSets/view',
			classic: '/_ui/common/config/entity/FieldSetListUI/d?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity&tableEnumOrId = Event&setupid = EventFieldSets',
		},
		'setup.eventCompactLayouts': {
			lightning: '/lightning/setup/ObjectManager/Event/CompactLayouts/view',
			classic: '/_ui/common/config/compactlayout/CompactLayoutListUi/d?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity&type = Event&setupid = EventCompactLayouts',
		},
		'setup.eventRecordTypes': {
			lightning: '/lightning/setup/ObjectManager/Event/RecordTypes/view',
			classic: '/ui/setup/rectype/RecordTypes?type = Event&setupid = EventRecords&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity',
		},
		'setup.eventLimits': {
			lightning: '/lightning/setup/ObjectManager/Event/Limits/view',
			classic: '/p/setup/custent/EntityLimits?type = Event&setupid = EventLimits&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity',
		},
		'setup.activityCustomFields': {
			lightning: '/lightning/setup/ObjectManager/Activity/FieldsAndRelationships/view',
			classic: '/p/setup/layout/LayoutFieldList?type = Activity&setupid = ActivityFields&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity',
		},
		'setup.publicCalendarsAndResources': {
			lightning: '/lightning/setup/Calendars/home',
			classic: '/023/s?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity&setupid = Calendars',
		},
		'setup.activitySettings': {
			lightning: '/lightning/setup/HomeActivitiesSetupPage/home',
			classic: '/setup/activitiesSetupPage.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DActivity&setupid = HomeActivitiesSetupPage',
		},
		'setup.autoAssociationSettings': {
			lightning: '/lightning/setup/AutoAssociationSettings/home',
			classic:
				'/p/camp/CampaignInfluenceAutoAssociationSetupUi/d?ftype = CampaignInfluence&setupid = AutoAssociationSettings&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCampaignInfluence2',
		},
		'setup.campaignInfluenceSettings': {
			lightning: '/lightning/setup/CampaignInfluenceSettings/home',
			classic: '/p/camp/CampaignInfluenceSetupUi/d?setupid = CampaignInfluenceSettings&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCampaignInfluence2',
		},
		'setup.leadAssignmentRules': {
			lightning: '/lightning/setup/LeadRules/home',
			classic: '/setup/own/entityrulelist.jsp?rtype = 1&entity = Lead&setupid = LeadRules&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DLead',
		},
		'setup.leadSettings': {
			lightning: '/lightning/setup/LeadSettings/home',
			classic: '/_ui/sales/lead/LeadSetup/d?setupid = LeadSettings&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DLead',
		},
		'setup.leadProcesses': {
			lightning: '/lightning/setup/LeadProcess/home',
			classic: '/setup/ui/bplist.jsp?id = 00Q&setupid = LeadProcess&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DLead',
		},
		'setup.webToLead': {
			lightning: '/lightning/setup/LeadWebtoleads/home',
			classic: '/lead/leadcapture.jsp?setupid = LeadWebtoleads&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DLead',
		},
		'setup.leadAutoResponseRules': {
			lightning: '/lightning/setup/LeadResponses/home',
			classic: '/setup/own/entityrulelist.jsp?rtype = 4&entity = Lead&setupid = LeadResponses&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DLead',
		},
		'setup.accountSettings': {
			lightning: '/lightning/setup/AccountSettings/home',
			classic: '/accounts/accountSetup.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DAccount&setupid = AccountSettings',
		},
		'setup.notesSettings': {
			lightning: '/lightning/setup/NotesSetupPage/home',
			classic: '/setup/notesSetupPage.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DNotes&setupid = NotesSetupPage',
		},
		'setup.contactRolesOnOpportunities': {
			lightning: '/lightning/setup/OpportunityRoles/home',
			classic: '/setup/ui/picklist_masterdetail.jsp?tid = 00K&pt = 11&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DOpportunity&setupid = OpportunityRoles',
		},
		'setup.salesProcesses': {
			lightning: '/lightning/setup/OpportunityProcess/home',
			classic: '/setup/ui/bplist.jsp?id = 006&setupid = OpportunityProcess&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DOpportunity',
		},
		'setup.opportunitySettings': {
			lightning: '/lightning/setup/OpportunitySettings/home',
			classic: '/setup/opp/oppSettings.jsp?setupid = OpportunitySettings&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DOpportunity',
		},
		'setup.pathSettings': {
			lightning: '/lightning/setup/PathAssistantSetupHome/home',
			classic: '/ui/setup/pathassistant/PathAssistantSetupPage?setupid = PathAssistantSetupHome&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DPathAssistant',
		},
		'setup.forecastsSettings': {
			lightning: '/lightning/setup/Forecasting3Settings/home',
			classic: '/_ui/sales/forecasting/ui/ForecastingSettingsPageAura?setupid = Forecasting3Settings&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DForecasting3',
		},
		'setup.forecastsHierarchy': {
			lightning: '/lightning/setup/Forecasting3Role/home',
			classic: '/ui/setup/forecasting/ForecastingRolePage?setupid = Forecasting3Role&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DForecasting3',
		},
		'setup.contactRolesOnCases': {
			lightning: '/lightning/setup/CaseContactRoles/home',
			classic: '/setup/ui/picklist_masterdetail.jsp?tid = 03j&pt = 45&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCase&setupid = CaseContactRoles',
		},
		'setup.caseAssignmentRules': {
			lightning: '/lightning/setup/CaseRules/home',
			classic: '/setup/own/entityrulelist.jsp?rtype = 1&entity = Case&setupid = CaseRules&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCase',
		},
		'setup.escalationRules': {
			lightning: '/lightning/setup/CaseEscRules/home',
			classic: '/setup/own/entityrulelist.jsp?rtype = 3&entity = Case&setupid = CaseEscRules&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCase',
		},
		'setup.supportProcesses': {
			lightning: '/lightning/setup/CaseProcess/home',
			classic: '/setup/ui/bplist.jsp?id = 500&setupid = CaseProcess&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCase',
		},
		'setup.supportSettings': {
			lightning: '/lightning/setup/CaseSettings/home',
			classic: '/_ui/support/organization/SupportOrganizationSetupUi/d?setupid = CaseSettings&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCase',
		},
		'setup.caseAutoResponseRules': {
			lightning: '/lightning/setup/CaseResponses/home',
			classic: '/setup/own/entityrulelist.jsp?rtype = 4&entity = Case&setupid = CaseResponses&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCase',
		},
		'setup.emailToCase': {
			lightning: '/lightning/setup/EmailToCase/home',
			classic: '/ui/setup/email/EmailToCaseSplashPage?setupid = EmailToCase&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCase',
		},
		'setup.feedFilters': {
			lightning: '/lightning/setup/FeedFilterDefinitions/home',
			classic: '/_ui/common/feedfilter/setup/ui/FeedFilterListPage/d?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCase&context = Case&setupid = FeedFilterDefinitions',
		},
		'setup.caseTeamRoles': {
			lightning: '/lightning/setup/CaseTeamRoles/home',
			classic: '/0B7?kp = 500&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCaseTeams&setupid = CaseTeamRoles',
		},
		'setup.predefinedCaseTeams': {
			lightning: '/lightning/setup/CaseTeamTemplates/home',
			classic: '/0B4?kp = 500&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCaseTeams&setupid = CaseTeamTemplates',
		},
		'setup.caseCommentTriggers': {
			lightning: '/lightning/setup/CaseCommentTriggers/home',
			classic: '/p/setup/layout/ApexTriggerList?type = CaseComment&setupid = CaseCommentTriggers&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCaseComment',
		},
		'setup.webToCase': {
			lightning: '/lightning/setup/CaseWebtocase/home',
			classic: '/cases/webtocasesetup.jsp?setupid = CaseWebtocase&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSelfService',
		},
		'setup.webToCaseHTMLGenerator': {
			lightning: '/lightning/setup/CaseWebToCaseHtmlGenerator/home',
			classic: '/_ui/common/config/entity/WebToCaseUi/e?setupid = CaseWebToCaseHtmlGenerator&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSelfService',
		},
		'setup.macroSettings': {
			lightning: '/lightning/setup/MacroSettings/home',
			classic: '/_ui/support/macros/MacroSettings/d?setupid = MacroSettings&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DMacro',
		},
		'setup.contactRolesOnContracts': {
			lightning: '/lightning/setup/ContractContactRoles/home',
			classic: '/setup/ui/picklist_masterdetail.jsp?tid = 02a&pt = 39&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DContract&setupid = ContractContactRoles',
		},
		'setup.contractSettings': {
			lightning: '/lightning/setup/ContractSettings/home',
			classic: '/ctrc/contractsettings.jsp?setupid = ContractSettings&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DContract',
		},
		'setup.orderSettings': {
			lightning: '/lightning/setup/OrderSettings/home',
			classic: '/oe/orderSettings.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DOrder&setupid = OrderSettings',
		},
		'setup.productSchedulesSettings': {
			lightning: '/lightning/setup/Product2ScheduleSetup/home',
			classic: '/setup/pbk/orgAnnuityEnable.jsp?setupid = Product2ScheduleSetup&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DProducts',
		},
		'setup.productSettings': {
			lightning: '/lightning/setup/Product2Settings/home',
			classic: '/setup/pbk/productSettings.jsp?setupid = Product2Settings&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DProducts',
		},
		'setup.assetFiles': {
			lightning: '/lightning/setup/ContentAssets/home',
			classic: '/03S?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DSalesforceFiles&setupid = ContentAssets',
		},
		'setup.chatterSettings': {
			lightning: '/lightning/setup/CollaborationSettings/home',
			classic: '/collaboration/collaborationSettings.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCollaboration&setupid = CollaborationSettings',
		},
		'setup.publisherLayouts': {
			lightning: '/lightning/setup/GlobalPublisherLayouts/home',
			classic: '/ui/setup/layout/PageLayouts?type = Global&setupid = GlobalPublisherLayouts&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DGlobalActions',
		},
		'setup.feedTracking': {
			lightning: '/lightning/setup/FeedTracking/home',
			classic: '/feeds/feedTracking.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCollaboration&setupid = FeedTracking',
		},
		'setup.emailSettings': {
			lightning: '/lightning/setup/ChatterEmailSettings/home',
			classic: '/_ui/core/chatter/email/ui/ChatterEmailSettings/e?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCollaboration&setupid = ChatterEmailSettings',
		},
		'setup.inboundChangeSets': {
			lightning: '/lightning/setup/InboundChangeSet/home',
			classic: '/changemgmt/listInboundChangeSet.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDeploy&setupid = InboundChangeSet',
		},
		'setup.outboundChangeSets': {
			lightning: '/lightning/setup/OutboundChangeSet/home',
			classic: '/changemgmt/listOutboundChangeSet.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDeploy&setupid = OutboundChangeSet',
		},
		'setup.feedItemLayouts': {
			lightning: '/lightning/setup/FeedItemLayouts/home',
			classic: '/ui/setup/layout/PageLayouts?type = FeedItem&setupid = FeedItemLayouts&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DFeedItemActionConfig',
		},
		'setup.feedItemActions': {
			lightning: '/lightning/setup/FeedItemActions/home',
			classic:
				'/p/setup/link/ActionButtonLinkList?pageName = FeedItem&type = FeedItem&setupid = FeedItemActions&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DFeedItemActionConfig',
		},
		'setup.feedCommentTriggers': {
			lightning: '/lightning/setup/FeedCommentTriggers/home',
			classic: '/p/setup/layout/ApexTriggerList?type = FeedComment&setupid = FeedCommentTriggers&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DFeedTriggers',
		},
		'setup.feedItemTriggers': {
			lightning: '/lightning/setup/FeedItemTriggers/home',
			classic: '/p/setup/layout/ApexTriggerList?type = FeedItem&setupid = FeedItemTriggers&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DFeedTriggers',
		},
		'setup.groupTriggers': {
			lightning: '/lightning/setup/CollaborationGroupTriggers/home',
			classic: '/p/setup/layout/ApexTriggerList?type = CollaborationGroup&setupid = CollaborationGroupTriggers&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCollaborationGroup',
		},
		'setup.groupMemberTriggers': {
			lightning: '/lightning/setup/CollaborationGroupMemberTriggers/home',
			classic:
				'/p/setup/layout/ApexTriggerList?type = CollaborationGroupMember&setupid = CollaborationGroupMemberTriggers&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCollaborationGroup',
		},
		'setup.groupRecordTriggers': {
			lightning: '/lightning/setup/CollaborationGroupRecordTriggers/home',
			classic:
				'/p/setup/layout/ApexTriggerList?type = CollaborationGroupRecord&setupid = CollaborationGroupRecordTriggers&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCollaborationGroup',
		},
		'setup.groupLayouts': {
			lightning: '/lightning/setup/CollaborationGroupLayouts/home',
			classic: '/ui/setup/layout/PageLayouts?type = CollaborationGroup&setupid = CollaborationGroupLayouts&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DCollaborationGroup',
		},
		'setup.topicTriggers': {
			lightning: '/lightning/setup/TopicTriggers/home',
			classic: '/p/setup/layout/ApexTriggerList?type = Topic&setupid = TopicTriggers&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DTopic',
		},
		'setup.topicAssignmentTriggers': {
			lightning: '/lightning/setup/TopicAssigmentTriggers/home',
			classic: '/p/setup/layout/ApexTriggerList?type = TopicAssignment&setupid = TopicAssigmentTriggers&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DTopic',
		},
		'setup.enhancedEmail': {
			lightning: '/lightning/setup/EnhancedEmail/home',
			classic: '/ui/setup/email/EnhancedEmailSetupPage?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DEmailExperience&setupid = EnhancedEmail',
		},
		'setup.individualSettings': {
			lightning: '/lightning/setup/IndividualSettings/home',
			classic: '/individual/individualSetup.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DIndividual&setupid = IndividualSettings',
		},
		'setup.customLabels': {
			lightning: '/lightning/setup/ExternalStrings/home',
			classic: '/101?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDevTools&setupid = ExternalStrings',
		},
		'setup.bigObjects': {
			lightning: '/lightning/setup/BigObjects/home',
			classic: '/p/setup/custent/BigObjectsPage?setupid = BigObjects&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDevTools',
		},
		'setup.picklistValueSets': {
			lightning: '/lightning/setup/Picklists/home',
			classic: '/_ui/platform/ui/schema/wizard/picklist/PicklistsPage?setupid = Picklists&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDevTools',
		},
		'setup.reportTypes': {
			lightning: '/lightning/setup/CustomReportTypes/home',
			classic: '/070?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDevTools&setupid = CustomReportTypes',
		},
		'setup.tabs': {
			lightning: '/lightning/setup/CustomTabs/home',
			classic: '/setup/ui/customtabs.jsp?setupid = CustomTabs&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDevTools',
		},
		'setup.globalActions': {
			lightning: '/lightning/setup/GlobalActions/home',
			classic: '/p/setup/link/ActionButtonLinkList?pageName = Global&type = Global&setupid = GlobalActionLinks&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DGlobalActions',
		},
		'setup.workflowRules': {
			lightning: '/lightning/setup/WorkflowRules/home',
			classic: '/_ui/core/workflow/WorkflowSplashUi?EntityId = WorkflowRule&setupid = WorkflowRules&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DWorkflow',
		},
		'setup.approvalProcesses': {
			lightning: '/lightning/setup/ApprovalProcesses/home',
			classic: '/p/process/ProcessDefinitionSetup?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DWorkflow&setupid = ApprovalProcesses',
		},
		'setup.flows': {
			lightning: '/lightning/setup/Flows/home',
			classic: '/300?setupid = InteractionProcesses&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DWorkflow',
		},
		'setup.tasks': {
			lightning: '/lightning/setup/WorkflowTasks/home',
			classic: '/_ui/core/workflow/WorkflowSplashUi?EntityId = ActionTask&setupid = WorkflowTasks&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DWorkflow',
		},
		'setup.emailAlerts': {
			lightning: '/lightning/setup/WorkflowEmails/home',
			classic: '/_ui/core/workflow/WorkflowSplashUi?EntityId = ActionEmail&setupid = WorkflowEmails&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DWorkflow',
		},
		'setup.fieldUpdates': {
			lightning: '/lightning/setup/WorkflowFieldUpdates/home',
			classic: '/_ui/core/workflow/WorkflowSplashUi?EntityId = ActionFieldUpdate&setupid = WorkflowFieldUpdates&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DWorkflow',
		},
		'setup.outboundMessages': {
			lightning: '/lightning/setup/WorkflowOutboundMessaging/home',
			classic: '/ui/setup/outbound/WfOutboundStatusUi?setupid = WorkflowOmStatus&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DMonitoring',
		},
		'setup.sendActions': {
			lightning: '/lightning/setup/SendAction/home',
			classic: '/07V?setupid = SendAction&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DWorkflow',
		},
		'setup.postTemplates': {
			lightning: '/lightning/setup/FeedTemplates/home',
			classic: '/07D?setupid = FeedTemplates&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DWorkflow',
		},
		'setup.processAutomationSettings': {
			lightning: '/lightning/setup/WorkflowSettings/home',
			classic: '/_ui/core/workflow/WorkflowSettingsUi?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DWorkflow&setupid = WorkflowSettings',
		},
		'setup.apexClasses': {
			lightning: '/lightning/setup/ApexClasses/home',
			classic:
				'/01p?retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate&setupid = ApexClasses',
		},
		'setup.apexTriggers': {
			lightning: '/lightning/setup/ApexTriggers/home',
			classic:
				'/setup/build/allTriggers.apexp?retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate&setupid = ApexTriggers',
		},
		'setup.apexTestExecution': {
			lightning: '/lightning/setup/ApexTestQueue/home',
			classic:
				'/ui/setup/apex/ApexTestQueuePage?retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate&setupid = ApexTestQueue',
		},
		'setup.apexHammerTestResults': {
			lightning: '/lightning/setup/ApexHammerResultStatus/home',
			classic:
				'/ui/setup/apex/ApexHammerResultStatusLandingPage?retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate&setupid = ApexHammerResultStatus',
		},
		'setup.api': {
			lightning: '/lightning/setup/WebServices/home',
			classic:
				'/ui/setup/sforce/WebServicesSetupPage?setupid = WebServices&retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate',
		},
		'setup.visualforceComponents': {
			lightning: '/lightning/setup/ApexComponents/home',
			classic:
				'/apexpages/setup/listApexComponent.apexp?retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate&setupid = ApexComponents',
		},
		'setup.changeDataCapture': {
			lightning: '/lightning/setup/CdcObjectEnablement/home',
			classic:
				'/ui/setup/cdc/CdcObjectEnablementPage?setupid = CdcObjectEnablement&retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate',
		},
		'setup.customPermissions': {
			lightning: '/lightning/setup/CustomPermissions/home',
			classic:
				'/0CP?setupid = CustomPermissions&retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate',
		},
		'setup.customMetadataTypes': {
			lightning: '/lightning/setup/CustomMetadata/home',
			classic:
				'/_ui/platform/ui/schema/wizard/entity/CustomMetadataTypeListPage?retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate&setupid = CustomMetadata',
		},
		'setup.customSettings': {
			lightning: '/lightning/setup/CustomSettings/home',
			classic:
				'/setup/ui/listCustomSettings.apexp?retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate&setupid = CustomSettings',
		},
		'setup.devHub': {
			lightning: '/lightning/setup/DevHub/home',
			classic:
				'/ui/setup/sfdx/SomaSetupPage?setupid = DevHub&retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate',
		},
		'setup.lightningComponents': {
			lightning: '/lightning/setup/LightningComponentBundles/home',
			classic: '/ui/aura/impl/setup/LightningComponentListPage?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DLightningComponents&setupid = LightningComponentBundles',
		},
		'setup.debugMode': {
			lightning: '/lightning/setup/UserDebugModeSetup/home',
			classic: '/ui/aura/impl/setup/UserDebugModeSetupPage?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DLightningComponents&setupid = UserDebugModeSetup',
		},
		'setup.visualforcePages': {
			lightning: '/lightning/setup/ApexPages/home',
			classic:
				'/apexpages/setup/listApexPage.apexp?retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate&setupid = ApexPages',
		},
		'setup.platformCache': {
			lightning: '/lightning/setup/PlatformCache/home',
			classic:
				'/0Er?setupid = PlatformCache&retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate',
		},
		'setup.sites': {
			lightning: '/lightning/setup/CustomDomain/home',
			classic:
				'/0DM/o?setupid = CustomDomain&retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate',
		},
		'setup.staticResources': {
			lightning: '/lightning/setup/StaticResources/home',
			classic:
				'/apexpages/setup/listStaticResource.apexp?retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate&setupid = StaticResources',
		},
		'setup.tools': {
			lightning: '/lightning/setup/ClientDevTools/home',
			classic:
				'/ui/setup/sforce/ClientDevToolsSetupPage?setupid = ClientDevTools&retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate',
		},
		'setup.externalDataSources': {
			lightning: '/lightning/setup/ExternalDataSource/home',
			classic:
				'/0XC?setupid = ExternalDataSource&retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate',
		},
		'setup.externalObjects': {
			lightning: '/lightning/setup/ExternalObjects/home',
			classic:
				'/p/setup/custent/ExternalObjectsPage?setupid = ExternalObjects&retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate',
		},
		'setup.platformEvents': {
			lightning: '/lightning/setup/EventObjects/home',
			classic:
				'/p/setup/custent/EventObjectsPage?setupid = EventObjects&retURL=%2Fsetup%2Fintegratesplash.jsp%3Fsetupid%3DDevToolsIntegrate%26retURL%3D%252Fui%252Fsetup%252FSetup%253Fsetupid%253DDevToolsIntegrate',
		},
		'setup.lightningAppBuilder': {
			lightning: '/lightning/setup/FlexiPageList/home',
			classic: '/_ui/flexipage/ui/FlexiPageFilterListPage?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DStudio&setupid = FlexiPageList',
		},
		'setup.installedPackages': {
			lightning: '/lightning/setup/ImportedPackage/home',
			classic: '/0A3?setupid = ImportedPackage&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DStudio',
		},
		'setup.packageUsage': {
			lightning: '/lightning/setup/PackageUsageSummary/home',
			classic: '/_ui/isvintel/ui/PackageUsageSummarySetupPage?setupid = PackageUsageSummary&retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DStudio',
		},
		'setup.appExchangeMarketplace': {
			lightning: '/lightning/setup/AppExchangeMarketplace/home',
			classic: '/packaging/viewAEMarketplace.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DStudio&setupid = AppExchangeMarketplace',
		},
		'setup.sandboxes': {
			lightning: '/lightning/setup/DataManagementCreateTestInstance/home',
			classic: '/07E?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DDeploy&setupid = DataManagementCreateTestInstance',
		},
		'setup.scheduledJobs': {
			lightning: '/lightning/setup/ScheduledJobs/home',
			classic: '/08e?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DJobs&setupid = ScheduledJobs',
		},
		'setup.apexJobs': {
			lightning: '/lightning/setup/AsyncApexJobs/home',
			classic: '/apexpages/setup/listAsyncApexJobs.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DJobs&setupid = AsyncApexJobs',
		},
		'setup.apexFlexQueue': {
			lightning: '/lightning/setup/ApexFlexQueue/home',
			classic: '/apexpages/setup/viewApexFlexQueue.apexp?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DJobs&setupid = ApexFlexQueue',
		},
		'setup.backgroundJobs': {
			lightning: '/lightning/setup/ParallelJobsStatus/home',
			classic: '/0Ys?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DJobs&setupid = ParallelJobsStatus',
		},
		'setup.dataExport': {
			lightning: '/lightning/setup/DataManagementExport/home',
			classic: 'chrome-extension://aodjmnfhjibkcdimpodiifdjnnncaafh/data-export.html?host = jstart.my.salesforce.com',
		},
		'setup.pausedFlows': {
			lightning: '/lightning/setup/Pausedflows/home',
			classic: '',
		},
		'setup.digitalExperienceAllSites': {
			lightning: '/lightning/setup/SetupNetworks/home',
			classic: '/_ui/networks/setup/SetupNetworksPage?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DNetworks&setupid = SetupNetworks',
		},
		'setup.digitalExperiencePages': {
			lightning: '/lightning/setup/CommunityFlexiPageList/home',
			classic: '/_ui/sites/setup/ui/CommunityFlexiPageFilterListPage?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DNetworks&setupid = CommunityFlexiPageList',
		},
		'setup.digitalExperienceSettings': {
			lightning: '/lightning/setup/NetworkSettings/home',
			classic: '/_ui/networks/setup/NetworkSettingsPage?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DNetworks&setupid = NetworkSettings',
		},
		'setup.digitalExperienceTemplates': {
			lightning: '/lightning/setup/CommunityTemplateDefinitionList/home',
			classic: '/_ui/sites/setup/ui/CommunityTemplateDefinitionFilterListPage?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DNetworks&setupid = CommunityTemplateDefinitionList',
		},
		'setup.digitalExperienceThemes': {
			lightning: '/lightning/setup/CommunityThemeDefinitionList/home',
			classic: '/_ui/sites/setup/ui/CommunityThemeDefinitionFilterListPage?retURL=%2Fui%2Fsetup%2FSetup%3Fsetupid%3DNetworks&setupid = CommunityThemeDefinitionList',
		},
		'setup.emailDeliverability': {
			lightning: '/lightning/setup/OrgEmailSettings/home',
			classic: '',
		},
		'setup.emailInternationalization': {
			lightning: '/lightning/setup/InternationalEmailAddresses/home',
			classic: '',
		},
		'setup.emailAttachments': {
			lightning: '/lightning/setup/EmailAttachmentSettings/home',
			classic: '',
		},
		'setup.emailDisclaimers': {
			lightning: '/lightning/setup/EmailDisclaimers/home',
			classic: '',
		},
		'setup.emailGMail': {
			lightning: '/lightning/setup/LightningForGmailAndSyncSettings/home',
			classic: '',
		},
		'setup.emailClassicTemplates': {
			lightning: '/lightning/setup/CommunicationTemplatesEmail/home',
			classic: '',
		},
		'setup.emailClassicLetterheads': {
			lightning: '/lightning/setup/CommunicationTemplatesLetterheads/home',
			classic: '',
		},
		'setup.emailFilterEmailTracking': {
			lightning: '/lightning/setup/FilterEmailTracking/home',
			classic: '',
		},
		'setup.emailOutlookSync': {
			lightning: '/lightning/setup/LightningForOutlookAndSyncSettings/home',
			classic: '',
		},
		'setup.emailExternalService': {
			lightning: '/lightning/setup/EmailTransportServiceSetupPage/home',
			classic: '',
		},
		'setup.emailTestDeliverability': {
			lightning: '/lightning/setup/TestEmailDeliverability/home',
			classic: '',
		},
		'setup.territoryModels': {
			lightning: '/lightning/setup/Territory2Models/home',
			classic: '/ui/setup/territory2/Territory2ModelListPage?setupid = Territory2Models',
		},
		'setup.customSettings': {
			lightning: '/lightning/setup/CustomSettings/home',
			classic: '/lightning/setup/CustomSettings/home',
		},
		'report.runReport': {
			lightning: '/lightning/o/Report/home',
			classic: '/00O/o',
		},
		'report.editReport': {
			lightning: '/lightning/o/Report/home',
			classic: '/00O/o',
		},
	},
};

export const sfObjectsGetData = {
	fieldsAndRelationships: {
		getDataRequest: (apiname) =>
			`/query/?q=SELECT DurableId, QualifiedApiName, Label, DataType, ValueTypeId FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${apiname}'`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				const fieldId = f.DurableId.split('.')[1];
				const key = '3rdlevel.' + f.QualifiedApiName;
				objCommands[key] = {
					key: key,
					url: `/lightning/setup/ObjectManager/${guiId}/FieldsAndRelationships/${fieldId}/view`,
					label: label + ' >> ' + f.QualifiedApiName,
					sortValue: 0.9, // Will cuase it to appear low on the sort
				};
				objCommands[key + '.fieldLevelSecurity'] = {
					key: key + '.fieldLevelSecurity',
					url: `/lightning/setup/ObjectManager/${guiId}/FieldsAndRelationships/${fieldId}/edit?standardEdit = true`,
					label: label + ' >> ' + f.QualifiedApiName + ' >> Field Level Security',
					sortValue: 0.1, // Will cuase it to appear low on the sort
				};
			});
			return objCommands;
		},
	},
	buttonsLinksActions: {
		getDataRequest: (apiname) => `/tooling/query/?q=select Id,Name,Label from StandardAction where EntityDefinitionId='${apiname}'`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				const fieldId = f.Id;
				const key = 'buttonsLinksActions.' + f.Name;
				objCommands[key] = {
					key: key,
					url: `/lightning/setup/ObjectManager/${guiId}/ButtonsLinksActions/${f.Name}/editStandardAction`,
					label: label + ' >> ' + f.Label,
				};
			});
			return objCommands;
		},
	},
	lightningPages: {
		getDataRequest: (apiname) => `/tooling/query/?q=SELECT Id, MasterLabel FROM FlexiPage where EntityDefinitionId='${apiname}'`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				const fieldId = f.Id;
				const key = 'lightningPages.' + f.MasterLabel;
				objCommands[key] = {
					key: key,
					url: `/lightning/setup/ObjectManager/${guiId}/LightningPages/${fieldId}/view`,
					label: label + ' >> ' + f.MasterLabel,
				};
				objCommands[key + '.edit'] = {
					key: key + '.edit',
					url: `/visualEditor/appBuilder.app?id=${fieldId}&clone=false&retUrl=%2flightning%2fsetup%2fObjectManager%2f${apiname}%2fLightningPages%2f${fieldId}%2fview`,
					label: label + ' >> ' + f.MasterLabel + ' >> Edit',
					sortValue: 0.1, // Will cuase it to appear low on the sort
				};
			});
			return objCommands;
		},
	},
	triggers: {
		getDataRequest: (apiname) => `/query/?q=SELECT id,Name FROM ApexTrigger where TableEnumOrId='${apiname}'`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				const fieldId = f.Id;
				const key = '3rdlevel.' + f.Name;
				objCommands[key] = {
					key: key,
					url: `/lightning/setup/ObjectManager/${guiId}/ApexTriggers/${fieldId}/view`,
					label: label + ' >> ' + f.Name,
				};
			});
			return objCommands;
		},
	},
	list: {
		//For "List Object", will load all Listviews defined. for example "List Cases >> Open Cases", "List Cases >> Closed Cases"
		getDataRequest: (apiname) => `/query/?q=SELECT Id, Name, DeveloperName, SobjectType FROM ListView Where SobjectType='${apiname}'`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				objCommands['ListView.' + f.Name] = {
					key: 'ListView.' + f.Name,
					url: `/lightning/o/${apiname}/list?filterName=${f.Id}`,
					label: label + ' >> ' + f.Name,
				};
			});
			return objCommands;
		},
	},
	pageLayouts: {
		getDataRequest: (apiname) => `/tooling/query?q=SELECT+Id,Name+FROM+Layout WHERE TableEnumOrId='${apiname}'`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				objCommands['PageLayout.' + f.Name] = {
					key: 'PageLayout.' + f.Name,
					url: `/lightning/setup/ObjectManager/${guiId}/PageLayouts/${f.Id}/view`,
					label: label + ' >> ' + f.Name,
				};
			});
			return objCommands;
		},
	},
	validationRules: {
		getDataRequest: (apiname) => `/tooling/query?q=SELECT Id, ValidationName FROM ValidationRule where EntityDefinition.DeveloperName = '${apiname}'`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				objCommands['ValidationRules.' + f.ValidationName] = {
					key: 'ValidationRules.' + f.ValidationName,
					url: `/lightning/setup/ObjectManager/${guiId}/ValidationRules/${f.Id}/view`,
					label: label + ' >> ' + f.ValidationName,
				};
			});
			return objCommands;
		},
	},
	users: {
		getDataRequest: (apiname) => `/query/?q=select id,name,isActive from user`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				let key = 'users.' + f.Name;
				objCommands[key] = {
					key: key,
					url: `/lightning/setup/ManageUsers/page?address=%2F${f.Id}%3Fnoredirect%3D1%26isUserEntityOverride%3D1`,
					label: label + ' >> ' + f.Name + (f.IsActive ? '' : '  (Inactive)'),
					sortValue: 0.9, // Will cuase it to appear low on the sort
				};
			});
			return objCommands;
		},
	},
	permissionSets: {
		getDataRequest: (apiname) => `/query/?q=select type,id,label from PermissionSet where type in ('Regular','Standard','Session','')`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				let key = 'permissionset.' + f.Label;
				objCommands[key] = {
					key: key,
					url: `/lightning/setup/PermSets/page?address=%2F${f.Id}`,
					label: label + ' >> ' + f.Label,
				};
				objCommands[key + '.objectSettings'] = {
					key: key + '.objectSettings',
					url: `/lightning/setup/PermSets/page?address=%2F${f.Id}%3Fs%3DEntityPermissions`,
					label: label + ' >> ' + f.Label + ' >> ' + t('moreData.objectSettings'),
					sortValue: 0.5, // Will cuase it to appear low on the sort
				};
			});
			return objCommands;
		},
	},
	permissionSetGroups: {
		getDataRequest: (apiname) => `/query/?q=select id,MasterLabel from PermissionSetGroup`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				let key = 'permissionsetgroup.' + f.MasterLabel;
				objCommands[key] = {
					key: key,
					url: `/lightning/setup/PermSetGroups/page?address=%2F${f.Id}`,
					label: label + ' >> ' + f.MasterLabel,
				};
				objCommands[key + 'permissionSetsIncluded'] = {
					key: key + 'permissionSetsIncluded',
					url: `/lightning/setup/PermSetGroups/page?address=%2F${f.Id}%3Fs%3DComponentPS`,
					label: label + ' >> ' + f.MasterLabel + ' >> ' + t('moreData.permissionSetsInGroup'),
					sortValue: 0.5, // Will cuase it to appear low on the sort
				};
			});
			return objCommands;
		},
	},
	runReport: {
		getDataRequest: (apiname) => `/query/?q=select Id, Name from report where IsDeleted = false`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				objCommands['RunReport.' + f.Name] = {
					key: 'RunReport.' + f.Name,
					url: `/lightning/r/sObject/${f.Id}/view`,
					label: t('prefix.setup') + ' > ' + t('report.runReport') + ' >> ' + f.Name,
				};
				objCommands['EditReport.' + f.Name] = {
					key: 'EditReport.' + f.Name,
					url: `/lightning/r/sObject/${f.Id}/edit`,
					label: t('prefix.setup') + ' > ' + t('report.editReport') + ' >> ' + f.Name,
				};
			});
			return objCommands;
		},
	},
	editReport: {
		getDataRequest: (apiname) => `/query/?q=select Id, Name from report where IsDeleted = false`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				objCommands['RunReport.' + f.Name] = {
					key: 'RunReport.' + f.Name,
					url: `/lightning/r/sObject/${f.Id}/view`,
					label: t('prefix.setup') + ' > ' + t('report.runReport') + ' >> ' + f.Name,
				};
				objCommands['EditReport.' + f.Name] = {
					key: 'EditReport.' + f.Name,
					url: `/lightning/r/sObject/${f.Id}/edit`,
					label: t('prefix.setup') + ' > ' + t('report.editReport') + ' >> ' + f.Name,
				};
			});
			return objCommands;
		},
	},
	profiles: {
		getDataRequest: (apiname) => `/query/?q=Select Id, Name From Profile`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				let key = 'profiles.' + f.Name;
				objCommands[key] = {
					key: key,
					url: `/lightning/setup/Profiles/page?address=%2F${f.Id}`,
					label: t('prefix.setup') + ' > ' + t('setup.profiles') + ' >> ' + f.Name,
				};
			});
			return objCommands;
		},
	},
	apexClasses: {
		getDataRequest: (apiname) => `/query/?q=Select Id, Name From ApexClass`,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			response.records.forEach((f) => {
				let key = 'apexClasses.' + f.Name;
				objCommands[key] = {
					key: key,
					url: `/lightning/setup/ApexClasses/page?address=%2F${f.Id}`,
					label: t('setup.apexClasses') + ' >> ' + f.Name,
				};
			});
			return objCommands;
		},
	},
	TEMPLATE: {
		getDataRequest: (apiname) => ``,
		processResponse: (apiname, label, guiId, response) => {
			let objCommands = {};
			return objCommands;
		},
	},
};
