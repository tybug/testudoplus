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
// @version     0.0.9
// @description Integrate Rate My Professor to Testudo Schedule of Classes
// @namespace   dkt.umdrmp.testudo
// @require     https://unpkg.com/ajax-hook/dist/ajaxhook.min.js
// ==/UserScript==

const DATA = {
  rmp: {},
  pt: {},
};
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
  // unsafeWindow.console.log(DATA.rmp);
  const instructorElements = unsafeWindow.document.querySelectorAll('.section-instructor');
  Array.prototype.map.call(instructorElements, (elem) => {
    const instructorName = getInstructorName(elem);
    if (DATA.rmp[instructorName]) {
      const oldElem = elem.querySelector('.rmp-rating-box');
      if (oldElem) {
        oldElem.remove();
      }
      const rating = DATA.rmp[instructorName].rating;
      const ratingElem = document.createElement('a');
      ratingElem.className = 'rmp-rating-box';
      ratingElem.href = rating ? `https://www.ratemyprofessors.com/ShowRatings.jsp?tid=${DATA.rmp[instructorName].recordId}` : '';
      ratingElem.title = instructorName;
      ratingElem.target = '_blank';
      ratingElem.innerText = rating ? rating.toFixed(1) : 'N/A';
      elem.appendChild(ratingElem);
    }
  });

  updatePTData();
}

function getRecordId(name) {
  return new Promise((resolve, reject) => {
    // unsafeWindow.console.log(ALIAS, name);
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
          const ratingRawElem = fakeHtml.querySelector('[class^="RatingValue__Numerator"]');
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
    if (!DATA.rmp[instructorName]) {
      DATA.rmp[instructorName] = {
        name: instructorName,
      };
      getRecordId(instructorName).then((recordId) => {
        getRating(recordId).then((rating) => {
          DATA.rmp[instructorName].recordId = recordId;
          DATA.rmp[instructorName].rating = rating;

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

function getPTCourseData(courseId) {
  return new Promise((resolve, reject) => {
    const url = `https://planetterp.com/course/${courseId}`;
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (data) => {
        if (data.status == 200) {
          const res = data.responseText;
          const reader = document.implementation.createHTMLDocument('reader'); // prevent loading any resources
          const fakeHtml = reader.createElement('html');
          fakeHtml.innerHTML = res;

          const courseData = {
            courseId,
            instructors: {},
          };

          const avgGPAElem = fakeHtml.querySelector('#course-grades > p.center-text');
          if (avgGPAElem) {
            const matchRes = avgGPAElem.innerText.match(/Average GPA: ([0-9]\.[0-9]{2})/);
            if (matchRes && matchRes[1]) {
              const avgGPA = Number(matchRes[1]);
              if (!Number.isNaN(avgGPA)) {
                courseData.avgGPA = avgGPA;
              }
            }
          }

          const instructorReviewElementList = fakeHtml.querySelectorAll('#course-professors > div');
          Array.prototype.map.call(instructorReviewElementList, (instructorCardElem) => {
            const instructorNameElem = instructorCardElem.querySelector('.card-header a');
            if (instructorNameElem) {
              const instructorName = instructorNameElem.innerText;
              const instructorId = instructorNameElem.getAttribute('href').replace(/^\/professor\//, '');

              const reviewElement = instructorCardElem.querySelector('.card-text');
              if (reviewElement) {
                const res = reviewElement.innerText.match(/Average rating: ([0-9]\.[0-9]{2})/);
                if (res && res[1]) {
                  const rating = Number(res[1]);
                  if (!Number.isNaN(rating)) {
                    courseData.instructors[instructorName] = {
                      name: instructorName,
                      id: instructorId,
                      rating,
                    }
                  }
                }
              }
            }
          });

          return resolve(courseData);
        }
        reject();
      }
    });
  });
}

function updatePTData() {
  const allCourseElem = document.querySelectorAll('#courses-page .course');
  Array.prototype.map.call(allCourseElem, (courseElem) => {
    const courseIdElem = courseElem.querySelector('.course-id');
    const courseId = courseIdElem.innerText;
    const courseIdContainer = courseIdElem.parentNode;

    const oldElem = courseElem.querySelector('.pt-gpa-box');
    if (oldElem) {
      oldElem.remove();
    }

    if (DATA.pt[courseId]) {
      const avgGPA = DATA.pt[courseId].avgGPA;

      const avgGPAElem = document.createElement('a');
      avgGPAElem.className = 'pt-gpa-box';
      avgGPAElem.href = `https://planetterp.com/course/${courseId}`;
      avgGPAElem.title = courseId;
      avgGPAElem.target = '_blank';
      avgGPAElem.innerText = avgGPA ? `AVG GPA ${avgGPA.toFixed(2)}` : 'N/A';
      courseIdContainer.appendChild(avgGPAElem);
    }

    const instructorElemList = courseElem.querySelectorAll('.section-instructor');

    Array.prototype.map.call(instructorElemList, (elem) => {
      const instructorName = getInstructorName(elem);
      if (DATA.pt[courseId] && DATA.pt[courseId].instructors[instructorName]) {
        const oldElem = elem.querySelector('.pt-rating-box');
        if (oldElem) {
          oldElem.remove();
        }

        const rating = DATA.pt[courseId].instructors[instructorName].rating;
        const ratingElem = document.createElement('a');
        ratingElem.className = 'pt-rating-box';
        ratingElem.href = rating ? `https://planetterp.com/professor/${DATA.pt[courseId].instructors[instructorName].id}` : '';
        ratingElem.title = instructorName;
        ratingElem.target = '_blank';
        ratingElem.innerText = rating ? rating.toFixed(2) : 'N/A';
        elem.appendChild(ratingElem);
      }
    });
  });
}

function loadPTData() {
  const courseIdElements = document.querySelectorAll('.course-id');

  let count = 0;

  function tryUpdateUI() {
    count += 1;

    if (count >= courseIdElements.length) {
      updatePTData();
    }
  }

  Array.prototype.map.call(courseIdElements, (elem) => {
    const courseId = elem.innerText;
    if (!DATA.pt[courseId]) {
      DATA.pt[courseId] = {
        courseId,
      };
      getPTCourseData(courseId).then((courseData) => {
        DATA.pt[courseId] = courseData;
        tryUpdateUI();
      }).catch(() => {
        tryUpdateUI();
      });
    }
  });
}

// unsafeWindow.window.x = updatePTData;

function main() {
  loadAliasTable().then(() => {
    // First load
    loadPTData();
    loadRateData();
    // Add hook to HTTP events
    const hookAjax = unsafeWindow.window.hookAjax;
    hookAjax({
      onreadystatechange: (xhr) => {
        if (/https?:\/\/app.testudo.umd.edu\/soc\/[0-9]{6}\/sections\?*/.test(xhr.responseURL)) {
          if(xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
            setTimeout(loadRateData, 200);
          }
        }
      },
    });
  });
}

function sortAllByGPA() {
    const coursesContainer = document.querySelector('#courses-page');
    const allCourses = [...document.querySelectorAll('div.course')];

    allCourses.sort((courseElem, otherCourseElem) => {
        if (!DATA.pt[courseElem.id] || !DATA.pt[courseElem.id].avgGPA) {
            return 100;
        }
        if (!DATA.pt[otherCourseElem.id] || !DATA.pt[otherCourseElem.id].avgGPA) {
            return -100;
        }
        return DATA.pt[otherCourseElem.id].avgGPA - DATA.pt[courseElem.id].avgGPA;
    });

    allCourses.forEach((courseElem) => {
        coursesContainer.append(courseElem);
    });

    const headerList = document.querySelectorAll('.course-prefix-container');

    if (headerList.length > 1) {
        headerList.forEach(e => e.remove());
    }
}

const ajaxHookLib = document.createElement('script');
ajaxHookLib.addEventListener('load', main);
ajaxHookLib.src = 'https://unpkg.com/ajax-hook/dist/ajaxhook.min.js';
document.head.appendChild(ajaxHookLib);

const styleInject = `
.rmp-rating-box,
.pt-rating-box {
  border-radius: 5px;
  padding: 1px 5px;
  margin-left: 10px;
  background-color: #FF0266;
  color: #FFFFFF !important;
  font-family: monospace;
}

.pt-rating-box {
  background-color: #009688;
}

.pt-gpa-box {
  display: flex;
  justify-content: center;
  text-align: center;
  margin-top: 10px;
  border-radius: 5px;
  background-color: #009688;
  color: #FFFFFF !important;
  font-family: monospace;
  padding: 1px;
}
`;
const styleInjectElem = document.createElement('style');
styleInjectElem.id = 'umd-rmp-style-inject';
styleInjectElem.innerHTML = styleInject;
document.head.appendChild(styleInjectElem);

// add sorting button
const sortBtn = document.createElement('button');
sortBtn.addEventListener('click', sortAllByGPA);
sortBtn.textContent = 'Sort By AVG GPA DESC';
document.querySelector('#content-wrapper > div').insertBefore(sortBtn, document.querySelector('#courses-page'));
