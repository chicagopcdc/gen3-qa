module.exports = {
    path: 'analysis/GWASUIApp',
    
    //Xpath:
    SelectCohortTitle: '//th[contains(text(),"Cohort Name")]',
    SelectFirstRadioInput: '(//input[@class="ant-radio-input"])[1]',
    SelectConceptTitle: '//th[contains(text(),"Concept ID")]',
    SelectFirstCheckboxInput: '(//input[@class="ant-checkbox-input"])[1]',
    SelectSecondCheckboxInput: '(//input[@class="ant-checkbox-input"])[2]',
    SelectPhenotypeTitle: '//th[contains(text(),"Phenotype")]',
    SetParameterDiv: '//*[@class="GWASUI-mainArea"]',
    NextSpan: '//span[contains(text(),\'Next\')]',
    PreviousSpan: '//span[contains(text(),\'Previous\')]',
    SubmitButton: '//span[contains(text(),\'Submit\')]',
    JobStatusesButton: '//*[contains(text(),"Statuses")]',
    JobIDs: '//h4[contains(text(),"Run ID")]',
    JobComplete: '//span[contains(text(),"Completed")]',
    JobProcessing: '//span[contains(text(),"Processing")]',
    JobCanceling: '//span[contains(text(),"Cancelling")]',
    JobStarted: '//div[contains(text(),"Started at")]',
    JobFinished: '//div[contains(text(),"finished at")]',
    JobDeleteButton: '//span[contains(text(),"delete")]',
    JobDeletePopup: '//div[contains(text(),"Are you sure")]',
    JobDeleteYes: '//span[contains(text(),"Yes")]',
    JobDeleteNo: '//span[contains(text(),"No")]',
    DownloadOutputButton: '//span[contains(text(),"download")]',
  };