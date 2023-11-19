to run locally:


window 1:- to automatically rebuild
	cd c:\Uri\Projects\salesforce-navigator\uri\build
	npm run watch   
	
FIRFOX:
window 2: to automatically reload:
	cd /d c:\Uri\Projects\salesforce-navigator\uri\build	 && 	web-ext run --start-url "https://cognyte--uri.sandbox.lightning.force.com/lightning/o/Case/list?filterName=Recent"  --firefox-Profile=dev --devtools

	cd /d C:\Uri\Projects\salesforce-navigator\force-navigator-issue-35\build	 && 	web-ext run --start-url "https://cognyte--uri.sandbox.lightning.force.com/lightning/o/Case/list?filterName=Recent"  --firefox-Profile=dev  --devtools


	 --keep-profile-changes          Run Firefox directly in custom profile. Any changes to the profile will be saved.
CHROME:
	cd c:\Uri\Projects\salesforce-navigator\uri\build && web-ext run --start-url "https://cognyte--uri.sandbox.lightning.force.com/lightning/o/Case/list?filterName=Recent"  --target chromium --chromium-profile "C:\Users\ueyal\AppData\Local\Google\Chrome\User Data\Profile 4" --devtools
	

load in Firefox in about:debugging#/runtime/this-firefox
in Firefox, load from     c:\Uri\Projects\salesforce-navigator\uri\build\manifest.json


To see background.js - Click "Inspect" on the extension

showSearchBox - show the searchbox


	"lookupCommands": ()=>{   - on letter entering
	"kbdCommand" - when enter pressed
**	"getMetaData" - load objects from SF
	parseMetadataFromSOBJECTSresponse - parse and create commands[]
	
	
	forceNavigator.commands - list of commands (with custom objects)
	
	
	
	
	
commands:
	DUMP
	
	
key: "00I.objects.fieldsAndRelationships"
​​label: "Setup > Partner > Fields"
​​url: "https://cognyte--uri.sandbox.lightning.force.com/lightning/setup/ObjectManager/Partner/FieldsAndRelationships/view"

---

Object { key: "a0P.objects.validationRules", url: "https://cognyte--uri.sandbox.lightning.force.com/lightning/setup/ObjectManager/Case_MTTR__c/ValidationRules/view", label: "Setup > Case MTTR > Validation Rules" }

Object { key: "a0P.objects.fieldsAndRelationships", url: "https://cognyte--uri.sandbox.lightning.force.com/lightning/setup/ObjectManager/Case_MTTR__c/FieldsAndRelationships/view", label: "Setup > Case MTTR > Fields" }


Object { key: "a0P.objects.pageLayouts", url: "https://cognyte--uri.sandbox.lightning.force.com/lightning/setup/ObjectManager/Case_MTTR__c/PageLayouts/view", label: "Setup > 

Case MTTR > Page Layouts" }

objectSetupLabelsMap




MTTR Fields:  	    https://cognyte--uri.sandbox.lightning.force.com/lightning/setup/ObjectManager/Case_MTTR__c/FieldsAndRelationships/view
MTTR Field Case:    https://cognyte--uri.sandbox.lightning.force.com/lightning/setup/ObjectManager/Case_MTTR__c/FieldsAndRelationships/00N8d00000JZhsS/view
MTTR Field End:     https://cognyte--uri.sandbox.lightning.force.com/lightning/setup/ObjectManager/Case_MTTR__c/FieldsAndRelationships/00N8d00000JZhw8/view
MTTR field Currency:https://cognyte--uri.sandbox.lightning.force.com/lightning/setup/ObjectManager/Case_MTTR__c/FieldsAndRelationships/CurrencyIsoCode/view


MTTR Page Layout:  	https://cognyte--uri.sandbox.lightning.force.com/lightning/setup/ObjectManager/Case_MTTR__c/PageLayouts/view	
MTTR Page layout 1:	https://cognyte--uri.sandbox.lightning.force.com/lightning/setup/ObjectManager/Case_MTTR__c/PageLayouts/00h8d000004j4fdAAA/view


get fields:   SELECT  QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Account' 



GUI:
	case fields ?
	country fields ?
	
	dump / 3rdlevel
	
	
sample request:
curl -H "Authorization: Bearer 00D2z0000008pSQ!AQEAQLCvHSK7FkcwdAYaDil2GZbilUUSkcnoiJ62ykXqy.muEQYcmatVqs760LcInIYhXv9MTyrvWzcqLbcV4AMjDRFZaoqg" "https://cognyte--uri.sandbox.my.salesforce.com/services/data/v56.0/query/?q=SELECT%20Id,%20Name,%20DeveloperName,%20SobjectType%20FROM%20ListView%20Where%20SobjectType='Asset'"	
	
	

                  
Web console filter:
					-/(home|aura_prod|empApi|beacon|onboarding|componentProfiler|one.app)/
					
					
BUILDING
for Firefox:
		cd /d c:\Uri\Projects\salesforce-navigator\uri\build
		web-ext build
		

/lightning/setup/ManageUsers/page?address=%${}%3Fnoredirect%3D1%26isUserEntityOverride%3D1

https://cognyte--uri.sandbox.lightning.force.com/lightning/setup/ManageUsers/page?address=0058d000004o3Fk



TODO:
	account fields due diligence start / end are missing in qaservice
	duplicate "home" and "setup"
	>>
	report - run / edit
	search apex classes
	
	for labels, use the intenrantionalization t
	CONTROL-LINE opens two windows
	profiles listing?
	
	QA Service - "Setup > Account > Fields >  sensitive" should find field SensitiveAccount__c
	logout
	if item is an oid, open it
	export / import
	
	
Building from scratch:
	> npm install --verbose    - on folder with package.json, to install all dependencies