import { sfCommander, sfCommanderSettings, _d, sfObjectsGetData, debugLog } from './shared';
import { t } from 'lisan';

const storageCache = { metaData: {}, commandsHistory: {} };

/* Load metadata from storage into storageCache. */
const initStorageCache = chrome.storage.session.get().then((items) => {
	// Copy the data retrieved from storage into storageCache.
	Object.assign(storageCache, items);
});

const storeSessionDataToStorageCache = (storageCache) => {
	chrome.storage.session.set(storageCache);
};

const showElement = (element) => {
	chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
		switch (element) {
			case 'appMenu':
				chrome.scripting.executeScript({
					target: { tabId: tabs[0].id },
					func: () => {
						document.getElementsByClassName('appLauncher')[0].getElementsByTagName('button')[0].click();
					},
				});
				break;
			case 'searchBox':
				chrome.scripting.executeScript({
					target: { tabId: tabs[0].id },
					func: () => {
						if (document.getElementById('sfnavSearchBox')) {
							document.getElementById('sfnavSearchBox').style.zIndex = 9999;
							document.getElementById('sfnavSearchBox').style.opacity = 0.98;
							document.getElementById('sfnavQuickSearch').focus();
						}
					},
				});
				break;
		}
	});
};

/*
 Load the compact layout for an object.  Later in search, these fields will be displayed in the resutls.
 Loading the layout:   "/services/data/v56.0/compactLayouts?q=Case"
	Case.fieldItems[1].label - label
	Case.fieldItems[1].layoutComponents[0].details.name - field name
*/
const loadCompactLayoutForSobject = (sobject, options, compactLayoutFieldsForSobject, sendResponse = null) => {
	//console.log("loadCompactLayoutForSobject " + sobject  + ".  options:",options)
	let url = 'https://' + options.apiUrl + '/services/data/' + sfCommander.apiVersion + '/compactLayouts?q=' + encodeURI(sobject);
	sfCommander
		.getHTTP(url, 'json', {
			Authorization: 'Bearer ' + options.sessionId,
			Accept: 'application/json',
		})
		.then((response) => {
			console.log('Request ' + url + ' respnse : ', response);
			if (response && response.error) {
				console.error('response', response, chrome.runtime.lastError);
				return;
			}
			let mainFields = '';
			//response has one element called by the sobject name. identify it
			for (const responseKey in response) {
				if (response.hasOwnProperty(responseKey)) {
					response[responseKey].fieldItems.forEach((f) => {
						mainFields += f.layoutComponents[0].details.name + ',';
					});
				}
			}
			mainFields = mainFields.slice(0, -1);
			compactLayoutFieldsForSobject[sobject] = mainFields;
			console.log('m,=' + mainFields);
			if (sendResponse) sendResponse({ mainFields: mainFields });
			else return mainFields;
		})
		.catch((e) => _d(e));
};

/*
 Do a search for objects on SF.
 searchQuery would be an array of strings to perform the SOSL search

 parameters:
	 searchQuery - text query entered by user
		options - hash passed from caller with context information
		sendResponse - a callback from the main page
*/
const doSearch = (searchQuery, options, sendResponse, labelToSobjectMapping, compactLayoutFieldsForSobject) => {
	//clean and identift what is searched:  What is the Sobject and what is the query
	searchQuery = searchQuery.replace(/^\?\s*/, '');
	let searchQueryArray = searchQuery.split(/([^\s"]+|"[^"]*")+/g).filter((value) => value != ' ' && value != '');
	let searchSobject = searchQueryArray[0]?.replaceAll('"', '');
	let lc_searchSobject = searchSobject.toLowerCase();
	searchQueryArray.shift(); //remove the sobject from the search query
	let searchText = searchQueryArray.join(' ').trim();
	if (searchText.startsWith('"') && searchText.endsWith('"')) searchText = searchText.slice(1, -1);
	//encode special characters:
	const specialChars = ['?', '&', '|', '!', '{', '}', '[', ']', '(', ')', '^', '~', '*', ':', '\\', '"', "'", '+', '-'];
	for (const char of specialChars) {
		const regex = new RegExp('\\' + char, 'g');
		searchText = searchText.replace(regex, '\\' + char);
	}
	//Which API field is the "Name" field of the record (account name, case number, product name, etc)
	const nameField = labelToSobjectMapping[lc_searchSobject];
	if (!nameField) {
		console.table(labelToSobjectMapping);
		sendResponse({ error: "can't find field " + lc_searchSobject });
		return;
	}
	const objectApiName = labelToSobjectMapping[lc_searchSobject].apiName;
	const lc_objectApiName = objectApiName.toLowerCase();
	let fieldsToReturn = '';
	if (compactLayoutFieldsForSobject[lc_objectApiName] != undefined) {
		fieldsToReturn = `(Id,${compactLayoutFieldsForSobject[lc_objectApiName]})`;
	} else {
		console.log('compactLayoutFieldsForSobject is missing for ' + lc_objectApiName + ':', compactLayoutFieldsForSobject);
		fieldsToReturn = `(Id,${nameField})`;
	}
	let SOQLQuery = `FIND {${searchText}} IN NAME FIELDS RETURNING ${objectApiName} ${fieldsToReturn} LIMIT 7`;
	console.debug('doSearch Query:' + SOQLQuery);
	let url = 'https://' + options.apiUrl + '/services/data/' + sfCommander.apiVersion + '/search/?q=' + encodeURI(SOQLQuery);
	sfCommander
		.getHTTP(url, 'json', {
			Authorization: 'Bearer ' + options.sessionId,
			Accept: 'application/json',
		})
		.then((response) => {
			console.info('doSearch Resposne:`n', response);
			if (response && response.error) {
				console.error('response', response, chrome.runtime.lastError);
				return;
			}
			sendResponse({
				searchRecords: response.searchRecords,
				searchObject: lc_searchSobject,
				objectApiName: objectApiName,
				mainFields: compactLayoutFieldsForSobject[objectApiName],
			});
			return;
		})
		.catch((e) => _d(e));
};

const getMetaData = (request, sendResponse) => {
	if (storageCache.metaData[request.sessionHash] == null || request.force) {
		console.debug('getMetaData calling /services/data/' + sfCommander.apiVersion + '/sobjects/');
		sfCommander
			.getHTTP('https://' + request.apiUrl + '/services/data/' + sfCommander.apiVersion + '/sobjects/', 'json', {
				Authorization: 'Bearer ' + request.sessionId,
				Accept: 'application/json',
			})
			.then((response) => {
				//Loaded the list of sobjects.  now load their  matching IDs.
				//Custom objects have an ID that should be used in the URL for the object manager
				const customObjectsIds = {};
				sfCommander
					.getHTTP(
						'https://' + request.apiUrl + '/services/data/' + sfCommander.apiVersion + '/tooling/query/?q=select namespacePrefix,DeveloperName,Id from CustomObject',
						'json',
						{
							Authorization: 'Bearer ' + request.sessionId,
							Accept: 'application/json',
						}
					)
					.then((customObjectResponse) => {
						customObjectResponse.records.forEach((f) => {
							let name = `${f.DeveloperName}__c`;
							if (f.namespacePrefix) name = `${f.namespacePrefix || ''}__${f.DeveloperName}__c`;
							const id = f.Id;
							customObjectsIds[name] = id;
						});

						// TODO good place to filter out unwanted objects
						storageCache.metaData[request.sessionHash] = parseMetadata(response, request.domain, request.settings, request.serverUrl, customObjectsIds);
						storeSessionDataToStorageCache(storageCache);
						sendResponse(storageCache.metaData[request.sessionHash]);
					})
					.catch((e) => _d(e));
			})
			.catch((e) => _d(e));
	} else sendResponse(storageCache.metaData[request.sessionHash]);
};

/*
 get details of an object (fields, page layouts, etc)
 sourceCommand == sfCommander.commands[command] object
 options - hash passed from caller with context information
 sendResponse - a callback from the main page
*/
const getMoreData = (sourceCommand, options, sendResponse) => {
	//console.log('getMoreData', sourceCommand, options);
	let apiname = sourceCommand.apiname;
	let guiId = sourceCommand.guiId ? sourceCommand.guiId : apiname;
	let label = sourceCommand.label;
	let key = sourceCommand.key;
	//last element in the key indicates what to load
	let commandArray = key.split('.');
	let infoToGet = commandArray[commandArray.length - 1];
	if (sourceCommand.detailsAlreadyLoaded) {
		sendResponse({ info: 'already loaded data for ' + infoToGet });
		return;
	}
	//Find the relevant query for this object, based on sfObjectsGetData
	let baseurl = 'https://' + options.apiUrl + '/services/data/' + sfCommander.apiVersion;
	let url = '';
	try {
		if (typeof sfObjectsGetData[infoToGet] != 'undefined') {
			url = baseurl + sfObjectsGetData[infoToGet].getDataRequest(apiname);
		} else {
			sendResponse({ info: "can't expand field " + infoToGet });
			return;
		}
	} catch (e) {
		_d(e);
	}
	//console.debug(`getMoreData(${infoToGet}) url: ${url}`);

	sfCommander
		.getHTTP(url, 'json', {
			Authorization: 'Bearer ' + options.sessionId,
			Accept: 'application/json',
		})
		.then((response) => {
			if (response && response.error) {
				console.error('response', response, chrome.runtime.lastError);
				return;
			}
			//use the "processResponse" for this object type, to generate the list of commands
			//TODO: REPLAICE APINAME BY ID
			let objCommands = sfObjectsGetData[infoToGet].processResponse(apiname, label, guiId, response);
			console.debug('getMoreDate parsed results:', objCommands);
			console.debug('options:: :', options);
			console.debug('metadata: :', storageCache.metaData[options.sessionHash]);
			Object.assign(storageCache.metaData[options.sessionHash], objCommands);
			storeSessionDataToStorageCache(storageCache);
			sendResponse(objCommands);
		})
		.catch((e) => _d(e));
};

const getOtherExtensionCommands = (otherExtension, requestDetails, settings = {}, sendResponse) => {
	const url = requestDetails.domain.replace(/https*:\/\//, '');
	const apiUrl = requestDetails.apiUrl;
	let commands = {};
	if (chrome.management) {
		chrome.management.get(otherExtension.id, (response) => {
			if (chrome.runtime.lastError) {
				console.debug('Other Extension ' + otherExtension.id + ' not found');
				return;
			}
			otherExtension.commands.forEach((c) => {
				commands[c.key] = {
					url: otherExtension.platform + '://' + otherExtension.urlId + c.url.replace('$URL', url).replace('$APIURL', apiUrl),
					label: t(c.key),
					key: c.key,
				};
			});
			sendResponse(commands);
		});
	}
};

const parseMetadata = (data, url, settings = {}, serverUrl, customObjectsIds) => {
	//console.debug('parseMetadata', data, url, settings, serverUrl);
	if (data.length == 0 || typeof data.sobjects == 'undefined') return false;
	const mapKeys = Object.keys(sfCommander.objectSetupLabelsMap);
	return data.sobjects.reduce((commands, sObjectData) => sfCommander.createSObjectCommands(commands, sObjectData, serverUrl, customObjectsIds), {});
};

const goToUrl = (targetUrl, newTab, settings = {}) => {
	console.log('goToUrl', targetUrl, newTab, settings);
	chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
		const re = new RegExp('\\w+-extension://' + chrome.runtime.id, 'g');
		targetUrl = targetUrl.replace(re, '');
		let newUrl = targetUrl.match(/.*?\.com(.*)/);
		newUrl = newUrl ? newUrl[1] : targetUrl;
		if (!targetUrl.includes('-extension:')) newUrl = tabs[0].url.match(/.*?\.com/)[0] + newUrl;
		else newUrl = targetUrl;
		if (newTab)
			chrome.tabs.create({
				active: false,
				url: newUrl,
				index: tabs[0].index + 1,
			});
		else chrome.tabs.update(tabs[0].id, { url: newUrl });
	});
};

chrome.commands.onCommand.addListener((command) => {
	switch (command) {
		case 'showSearchBox':
		case 'alternativeShowSearchBox':
			showElement('searchBox');
			break;
	}
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	var apiUrl = request.serverUrl?.replace('lightning.force.com', 'my.salesforce.com');
	console.debug('Request.action: ', request.action);

	initStorageCache
		.then(() => {
			//console.debug('Request.action after storage init: ', request, 'metadata:', storageCache.metaData, 'commandsHistory:', storageCache.commandsHistory);

			switch (request.action) {
				case 'goToUrl':
					goToUrl(request.url, request.newTab, request.settings);
					break;
				case 'getOtherExtensionCommands':
					getOtherExtensionCommands(request.otherExtension, request, request.settings, sendResponse);
					break;
				case 'getApiSessionId':
					request.sid = request.uid = request.domain = request.oid = '';
					chrome.cookies.getAll({}, (all) => {
						all.forEach((c) => {
							if (c.domain == request.serverUrl && c.name === 'sid') {
								request.sid = c.value;
								request.domain = c.domain;
								request.oid = request.sid.match(/([\w\d]+)/)[1];
							}
						});
						if (request.sid === '') {
							//Alternative method to get the SID. see https://stackoverflow.com/a/34993849
							//TODO: In case request.sid is not '', the call to the API is not happening. should be extracted from here and repeated there.

							chrome.cookies.get(
								{
									url: apiUrl,
									name: 'sid',
									storeId: sender.tab.cookieStoreId,
								},
								(c) => {
									if (c) {
										request.sid = c.value;
										request.domain = c.domain;
										request.oid = request.sid.match(/([\w\d]+)/)[1];
									}
									if (request.sid === '') {
										console.log('No session data found for ' + request.serverUrl);
										sendResponse({
											error: 'No session data found for ' + request.serverUrl,
										});
										return true;
									}
									sfCommander
										.getHTTP(apiUrl + '/services/data/' + sfCommander.apiVersion, 'json', {
											Authorization: 'Bearer ' + request.sid,
											Accept: 'application/json',
										})
										.then((response) => {
											if (response?.errorCode) {
												sendResponse({ error: 'Error accessing API for ' + request.oid + ' - ' + response.message });
												return true;
											}
											if (response?.identity) {
												request.uid = response.identity.match(/005.*/)[0];
												let apiSessionIdResponse = {
													sessionId: request.sid,
													userId: request.uid,
													orgId: request.oid,
													apiUrl: request.domain,
												};

												sendResponse(apiSessionIdResponse);
											} else
												sendResponse({
													error: 'No API data found for ' + request.oid,
												});
										});
								}
							);
						}
					});
					break;
				case 'getActiveFlows':
					let flowCommands = {};
					sfCommander
						.getHTTP(
							'https://' +
								request.apiUrl +
								'/services/data/' +
								sfCommander.apiVersion +
								'/query/?q=select+ActiveVersionId,Label+from+FlowDefinitionView+where+IsActive=true',
							'json',
							{
								Authorization: 'Bearer ' + request.sessionId,
								Accept: 'application/json',
							}
						)
						.then((response) => {
							let targetUrl = request.domain + '/builder_platform_interaction/flowBuilder.app?flowId=';
							response.records.forEach((f) => {
								flowCommands['flow.' + f.ActiveVersionId] = {
									key: 'flow.' + f.ActiveVersionId,
									url: targetUrl + f.ActiveVersionId,
									label: [t('prefix.flows'), f.Label].join(' > '),
								};
							});
							sendResponse(flowCommands);
						})
						.catch((e) => {
							_d(e, 'error in getActiveFlows');
							console.trace();
						});
					break;
				case 'getSobjectNameFields':
					let labelToSobjectMapping = {};
					const q = encodeURI(
						"select QualifiedApiName, EntityDefinition.QualifiedApiName,EntityDefinition.MasterLabel,EntityDefinition.developerName,EntityDefinition.namespacePrefix  from FieldDefinition where (EntityDefinition.QualifiedApiName like '%') and IsNameField = true"
					);
					/*
output format:
	EntityDefinition.QualifiedApiName	EntityDefinition.MasterLabel		QualifiedApiName
	API Name of the object				Object Label						'Name' field for this object
	----------------					------------------					--------
	Product2							Product								Name
	Problem								Problem								ProblemNumber
	ActivityHistory						Activity History					Subject
*/

					let url = 'https://' + request.apiUrl + '/services/data/' + sfCommander.apiVersion + '/query/?q=' + q;
					sfCommander
						.getHTTP(url, 'json', {
							Authorization: 'Bearer ' + request.sessionId,
							Accept: 'application/json',
						})
						.then((response) => {
							response.records.forEach((f) => {
								const nameField = f.QualifiedApiName;
								const apiName = f.EntityDefinition.QualifiedApiName;
								//						const namespace_developerName = (f.EntityDefinition.namespacePrefix || '') + '.' + f.EntityDefinition.developerName;
								let objectLabel = f.EntityDefinition.MasterLabel.toLowerCase();
								if (labelToSobjectMapping[objectLabel]) {
									//Duplicate label. add the API Name to distibguish the two (for example, Calendar and CalendarView have the same label)
									objectLabel = objectLabel + '(' + apiName + ')';
								}
								objectLabel = objectLabel.replace(/['\"]/g, '');
								labelToSobjectMapping[objectLabel] = {
									apiName: apiName,
									//							namespace_developerName: namespace_developerName,
									nameField: nameField, //The field that represents the record name (case number, ContractNumber,etc)
								};
								sendResponse({
									labelToSobjectMapping: labelToSobjectMapping,
								});
							});
						})
						.catch((e) => _d(e, 'Error accessing ' + url));
					break;
				case 'getMetadata':
					getMetaData(request, sendResponse);
					break;
				case 'getMoreData':
					getMoreData(request.sourceCommand, request, sendResponse);
					break;
				case 'doSearch':
					doSearch(request.searchQuery, request, sendResponse, request.labelToSobjectMapping, request.compactLayoutFieldsForSobject);
					break;
				case 'loadCompactLayoutForSobject':
					loadCompactLayoutForSobject(request.sobject, request, request.compactLayoutFieldsForSobject, sendResponse);
					break;
				case 'createTask':
					sfCommander
						.getHTTP(
							'https://' + request.apiUrl + '/services/data/' + sfCommander.apiVersion + '/sobjects/Task',
							'json',
							{
								Authorization: 'Bearer ' + request.sessionId,
								'Content-Type': 'application/json',
							},
							{ Subject: request.subject, OwnerId: request.userId },
							'POST'
						)
						.then(function (response) {
							sendResponse(response);
						});
					break;
				case 'searchLogins':
					sfCommander
						.getHTTP(
							'https://' +
								request.apiUrl +
								'/services/data/' +
								sfCommander.apiVersion +
								"/query/?q=SELECT Id, Name, Username FROM User WHERE Name LIKE '%25" +
								request.searchValue.trim() +
								"%25' OR Username LIKE '%25" +
								request.searchValue.trim() +
								"%25'",
							'json',
							{
								Authorization: 'Bearer ' + request.sessionId,
								'Content-Type': 'application/json',
							}
						)
						.then(function (success) {
							sendResponse(success);
						})
						.catch(function (error) {
							console.error(error);
						});
					break;
				case 'help':
					chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
					break;
				case 'updateLastCommand':
					if (request.key == undefined || request.url == undefined) break;
					if (storageCache.commandsHistory[request.orgId] == undefined) storageCache.commandsHistory[request.orgId] = [];
					var command = [request.key, request.url];
					//if already exists in history, move it to top
					for (var i = storageCache.commandsHistory[request.orgId].length - 1; i >= 0; i--) {
						if (storageCache.commandsHistory[request.orgId][i][0] == request.key) {
							storageCache.commandsHistory[request.orgId].splice(i, 1);
							storeSessionDataToStorageCache(storageCache);
							break;
						}
					}
					storageCache.commandsHistory[request.orgId].push(command);
					if (storageCache.commandsHistory[request.orgId].length > 8) {
						storageCache.commandsHistory[request.orgId].shift();
					}
					storeSessionDataToStorageCache(storageCache);
					break;
				case 'getCommandsHistory':
					sendResponse({ commandsHistory: storageCache.commandsHistory[request.orgId] });
					break;
			}
		})
		.catch((e) => {
			_d(e, 'Error in initStorageCache');
		});

	return true;
});

chrome.runtime.onInstalled.addListener((details) => {
	if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
		checkCommandShortcuts();
	}
});

//On install, check if the shotcut keys are assigned
function checkCommandShortcuts() {
	chrome.commands.getAll((commands) => {
		for (let { name, shortcut } of commands) {
			if (shortcut === '') console.error('shortcut ' + name + ' missing key assignment');
			else console.debug('shortcut ' + name + ' mapped to key ' + shortcut);
		}
	});

	//chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
}
