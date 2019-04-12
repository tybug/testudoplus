// ==UserScript==
// @name        Terp Course Helper
// @author      DickyT
// @license     WTFPL
// @encoding    utf-8
// @date        04/12/2019
// @modified    04/12/2019
// @include     https://app.testudo.umd.edu/soc/*
// @grant       GM_xmlhttpRequest
// @run-at      document-end
// @version     0.0.3
// @description Integrate Rate My Professor to Testudo Schedule of Classes
// @namespace   dkt.umdrmp.testudo
// @require     https://unpkg.com/ajax-hook/dist/ajaxhook.min.js
// ==/UserScript==

const DATA = {};
let ALIAS = {};

function loadAliasTable() {
  return new Promise((resolve) => {
    const url = 'https://raw.githubusercontent.com/DickyT/Terp-Course-Helper/master/alias.json';
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (data) => {
        if (data.status == 200) {
          ALIAS = JSON.parse(data.responseText);
        }
        resolve();
      }
    });
  });
}

function getInstructorName(elem) {
  const container = elem.childNodes[0];
  if (container instanceof HTMLAnchorElement) {
    return container.innerText;
  }
  return container.wholeText;
}

function updateInstructorRating() {
  unsafeWindow.console.log(DATA);
  const instructorElements = unsafeWindow.document.querySelectorAll('.section-instructor');
  Array.prototype.map.call(instructorElements, (elem) => {
    const instructorName = getInstructorName(elem);
    if (DATA[instructorName]) {
      const oldElem = elem.querySelector('.rmp-rating-box');
      if (oldElem) {
        oldElem.remove();
      }
      const rating = DATA[instructorName].rating;
      const ratingElem = document.createElement('a');
      ratingElem.className = 'rmp-rating-box';
      ratingElem.href = rating ? `https://www.ratemyprofessors.com/ShowRatings.jsp?tid=${DATA[instructorName].recordId}` : '';
      ratingElem.title = instructorName;
      ratingElem.target = '_blank';
      ratingElem.innerText = rating ? rating.toFixed(1) : 'N/A';
      elem.appendChild(ratingElem);
    }
  });
}

function getRecordId(name) {
  return new Promise((resolve, reject) => {
    unsafeWindow.console.log(ALIAS, name);
    if (ALIAS[name]) {
      const recordId = ALIAS[name].rmpId;
      if (recordId) {
        return resolve(recordId);
      }
    }
    const url = `https://search-production.ratemyprofessors.com/solr/rmp/select?q=${encodeURIComponent(name)}&defType=edismax&qf=teacherfullname_t%5E1000%20autosuggest&bf=pow%28total_number_of_ratings_i%2C2.1%29&siteName=rmp&rows=20&start=0&fl=pk_id%20teacherfirstname_t%20teacherlastname_t%20total_number_of_ratings_i%20schoolname_s%20averageratingscore_rf%20averageclarityscore_rf%20averagehelpfulscore_rf%20averageeasyscore_rf%20chili_i%20schoolid_s%20teacherdepartment_s&fq=schoolid_s%3A1270&wt=json`;
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (data) => {
        if (data.status == 200) {
          const res = JSON.parse(data.responseText);

          const suggestionList = res.response.docs;
          const [instructorInfo] = suggestionList.filter(d => d.schoolid_s === '1270');
          if (instructorInfo) {
            // unsafeWindow.console.log(instructorInfo);
            return resolve(instructorInfo.pk_id);
          }
        }
        reject();
      }
    });
  });
}

function getRating(recordId) {
  return new Promise((resolve, reject) => {
    const url = `https://www.ratemyprofessors.com/ShowRatings.jsp?tid=${recordId}`;
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (data) => {
        if (data.status == 200) {
          const res = data.responseText;
          const reader = document.implementation.createHTMLDocument('reader'); // prevent loading any resources
          const fakeHtml = reader.createElement('html');
          fakeHtml.innerHTML = res;
          const ratingRawElem = fakeHtml.querySelector('#mainContent div.grade');
          if (ratingRawElem) {
            return resolve(Number(ratingRawElem.innerText));
          }
        }
        reject();
      }
    });
  });
}

function loadRateData() {
  const instructorElements = unsafeWindow.document.querySelectorAll('.section-instructor');
  Array.prototype.map.call(instructorElements, (elem) => {
    const instructorName = getInstructorName(elem);
    if (!DATA[instructorName]) {
      DATA[instructorName] = {
        name: instructorName,
      };
      getRecordId(instructorName).then((recordId) => {
        getRating(recordId).then((rating) => {
          DATA[instructorName].recordId = recordId;
          DATA[instructorName].rating = rating;

          updateInstructorRating();
        }).catch(() => {
          updateInstructorRating();
        });
      }).catch(() => {
        updateInstructorRating();
      });
    }
  });
}

function main() {
  loadAliasTable().then(() => {
    const hookAjax = unsafeWindow.window.hookAjax;
    hookAjax({
      onreadystatechange: (xhr) => {
        if(xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
          setTimeout(loadRateData, 200);
        }
      },
    });
  });
}

const ajaxHookLib = document.createElement('script');
ajaxHookLib.addEventListener('load', main);
ajaxHookLib.src = 'https://unpkg.com/ajax-hook/dist/ajaxhook.min.js';
document.head.appendChild(ajaxHookLib);

const styleInject = `
.rmp-rating-box {
  border-radius: 5px;
  padding: 1px 5px;
  margin-left: 10px;
  background-color: #FF0266;
  color: #FFFFFF !important;
  font-family: monospace;
  font-weight: bold;
}
`;
const styleInjectElem = document.createElement('style');
styleInjectElem.id = 'umd-rmp-style-inject';
styleInjectElem.innerHTML = styleInject;
document.head.appendChild(styleInjectElem);

