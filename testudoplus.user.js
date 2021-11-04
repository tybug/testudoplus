// ==UserScript==
// @name        Testudo+
// @author      tybug, minermaniac447
// @license     GPL3
// @encoding    utf-8
// @date        04/12/2019
// @modified    11/1/2021
// @include     https://app.testudo.umd.edu/soc/*
// @grant       GM_xmlhttpRequest
// @run-at      document-end
// @version     0.1.7
// @description Improve the Testudo Schedule of Classes
// @namespace   tybug
// ==/UserScript==

const DATA = {
  rmp: {},
  pt: {},
};
let ALIAS = {};

// add sorting button
const sortBtn = document.createElement('button');
sortBtn.addEventListener('click', sortAllByGPA);
sortBtn.disabled = true;
sortBtn.textContent = 'Sort By Average GPA Descending (Loading data, please wait)';
document.querySelector('#content-wrapper > div').insertBefore(sortBtn, document.querySelector('#courses-page'));

// add reset button
const resetBtn = document.createElement('button');
resetBtn.style.cssText = "margin-left: 20px;"
resetBtn.addEventListener('click', resetSort);
resetBtn.textContent = 'Reset Sort';
document.querySelector('#content-wrapper > div').insertBefore(resetBtn, document.querySelector('#courses-page'));

function loadAliasTable() {
  return new Promise((resolve) => {
    const url = 'https://raw.githubusercontent.com/tybug/testudoplus/master/alias.json';
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

function getInstructor(name) {
  return new Promise((resolve, reject) => {
    if (ALIAS[name]) {
      name = ALIAS[name].rmp_name;
    }
    const url = `https://search-production.ratemyprofessors.com/solr/rmp/select?q=${encodeURIComponent(name)}&defType=edismax&qf=teacherfullname_t%5E1000%20autosuggest&bf=pow%28total_number_of_ratings_i%2C2.1%29&siteName=rmp&rows=20&start=0&fl=pk_id%20teacherfirstname_t%20teacherlastname_t%20total_number_of_ratings_i%20schoolname_s%20averageratingscore_rf%20averageclarityscore_rf%20averagehelpfulscore_rf%20averageeasyscore_rf%20chili_i%20schoolid_s%20teacherdepartment_s&fq=schoolid_s%3A1270&wt=json`;
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (data) => {
        if (data.status == 200) {
          const res = JSON.parse(data.responseText);

          var instructors = res.response.docs;
          var instructor_match = null;
          if (instructors) {
            instructors.forEach(function(instructor) {
              // if any of the returned profs match our name exactly, use that
              if (`${instructor.teacherfirstname_t} ${instructor.teacherlastname_t}` == name) {
                instructor_match = instructor;
              }
            });
            // otherwise, just take the first one
            if (instructor_match == null) {
              instructor_match = instructors[0];
            }
            return resolve(instructor_match);
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
      getInstructor(instructorName).then((instructor) => {
          DATA.rmp[instructorName].recordId = instructor.pk_id;
          DATA.rmp[instructorName].rating = instructor.averageratingscore_rf;

          updateInstructorRating();
      }).catch(() => {
        updateInstructorRating();
      });
    }
  });
}

async function planetterpAPI(endpoint, parameters) {
  const params = new URLSearchParams(parameters).toString()
  const response = await fetch(`https://api.planetterp.com/v1/${endpoint}?${params}`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });
  if (response.status != 200) throw new Error("ERROR: " + endpoint + " request failed. Parameters: " + JSON.stringify(parameters));
  return response.json();
}

async function getPTCourseData(courseId) {
  var courseSchema;
  try {
    courseSchema = await planetterpAPI("course", {name: courseId});
  } catch (error) {
    console.error(error);
    courseSchema = {"professors":[],"average_gpa":null};
  }
  const courseData = {
      courseId,
      instructors: {},
      avgGPA: courseSchema.average_gpa
  };

  // TODO lump this and the next set of promises together so they can all happen asyncly, we don't care
  // what order they happen in, just that they all finish before this function returns

  await Promise.all(courseSchema.professors.map(async (professor) => {
    var profSchema
    try {
      profSchema = await planetterpAPI("professor", {name: professor}, {});
    } catch (error) {
      console.error(error);
      profSchema = {professor, "slug": "error", "average_rating": null};
    }
    courseData.instructors[professor] = {
      name: professor,
      id: profSchema.slug,
      rating: profSchema.average_rating
    }
  }));
  return courseData;
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

      const shareCourseElem = courseIdContainer.querySelector('.share-course-div');
      if (shareCourseElem) {
        shareCourseElem.before(avgGPAElem);
      } else {
        courseIdContainer.appendChild(avgGPAElem);
      }
    }

    const instructorElemList = courseElem.querySelectorAll('.section-instructor');

    Array.prototype.map.call(instructorElemList, (elem) => {
      const instructorName = getInstructorName(elem);
      if (DATA?.pt?.[courseId]?.instructors?.[instructorName]) {
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

async function loadPTData() {
  const courseIdElements = Array.from(document.querySelectorAll('.course-id'));

  let numLoaded = 0;

  function tryUpdateUI() {
    updatePTData();
    sortBtn.textContent = `Sort By Average GPA Descending (Loading ${numLoaded}/${courseIdElements.length})`;

    if (numLoaded === courseIdElements.length) {
      sortBtn.textContent = 'Sort By Average GPA Descending';
      sortBtn.disabled = false;
    }
  }

  await Promise.allSettled(courseIdElements.map(async (elem) => {
    const courseId = elem.innerText;
    if (!DATA.pt[courseId]) {
      DATA.pt[courseId] = {
        courseId,
      };
      const courseData = await getPTCourseData(courseId);
      DATA.pt[courseId] = courseData;
      numLoaded += 1;
      tryUpdateUI();
    }
  }));
}

function createShareLinks() {
  const courseElements = unsafeWindow.document.querySelectorAll('.course');
  const copyLink = courseId => {
    const copyfield = document.createElement('textarea');
    copyfield.value = genShareLink(courseId);
    document.body.appendChild(copyfield);
    copyfield.select();
    document.execCommand('copy');
    document.body.removeChild(copyfield);
  };
  Array.prototype.map.call(courseElements, (elem) => {
    const shareDiv = document.createElement('div');
    shareDiv.className = 'share-course-div';
    shareDiv.setAttribute("data-tooltip", "click to copy");
    const shareLink = document.createElement('a');
    shareLink.className = 'share-course-link';
    shareLink.innerText = "Share";
    shareLink.title = "Copy Course Link\n" + genShareLink(elem.id);
    shareDiv.appendChild(shareLink);
    shareDiv.addEventListener('click', function(e) {
      copyLink(elem.id);
    });
    elem.querySelector('.course-id-container').appendChild(shareDiv);
  });
}

// An even more abstract TermID getter, from a url
function getTermId(url) {
  if (url.includes("termId=")) { // for most URLs, this will return the term id
    return url.split("termId=")[1].split("&")[0];
  } else if (url.includes("/gen-ed/")) { // the geneds page has the term id after the /gen-ed/ address portion, similar to how individual courses or depts do it
    return url.split("/gen-ed/")[1].split("/")[0];
  } else { // if it's another shortlink
    return url.split("/soc/")[1].split("/")[0];
  }
}

// A more abstract link generator
function genShortLink(courseDept, courseId = "") {
  const baseURL = "https://app.testudo.umd.edu/soc";
  const termId = getTermId(window.location.href);
  // if courseId is a blank string (default if it's missing), don't include that portion of the link
  return baseURL + "/" + termId + "/" + courseDept + (courseId === "" ? "" : "/" + courseId);
}

// Specifically generates course share links
function genShareLink(courseId) {
  return genShortLink(courseId.substring(0, 4), courseId);
}

function main() {
  loadAliasTable().then(() => {
    // First load
    loadPTData();
    loadRateData();
    createShareLinks();
    // Linkify all courses in descriptions
    linkifyCourses();
  });
}

function linkifyCourses() {
  const allPrereqs = [...document.querySelectorAll('div.approved-course-text')];
  const allDescs = [...document.querySelectorAll('div.course-text')];
  const allIDs = [...document.querySelectorAll('div.course-id')];
  const courseReg = /([A-Z]{4}[0-9]{3}[A-Z]?)/g;

  allPrereqs.forEach((prereqDiv) => {
    if (prereqDiv.innerHTML.includes("<div>")) {
      Array.from(prereqDiv.children[0].children[0].children).forEach((replace) => {
      replace.innerHTML = replace.innerHTML.replaceAll(/([A-Z]{4}[0-9]{3}[A-Z]?)/g, linkifyHelper);
    })} else {
      prereqDiv.innerHTML = prereqDiv.innerHTML.replaceAll(/([A-Z]{4}[0-9]{3}[A-Z]?)/g, linkifyHelper);
    }
  });

  allDescs.forEach((descDiv) => {
    descDiv.innerHTML = descDiv.innerHTML.replaceAll(courseReg, linkifyHelper);
  });

  allIDs.forEach((idDiv) => {
    idDiv.innerHTML = idDiv.innerHTML.replaceAll(courseReg, linkifyHelper);
  });
}

function linkifyHelper(match, offset, string) {
  return '<a class="linkified-course" href=' + genShareLink(match) + ">" + match + "</a>";
}

function sortAllByGPA() {
  const coursesContainer = document.querySelector('.courses-container');
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

function resetSort() {
  const coursesContainer = document.querySelector('.courses-container');
  const allCourses = [...document.querySelectorAll('div.course')];

  allCourses.sort((course1, course2) => {
    return course1.id.toLowerCase().localeCompare(course2.id.toLowerCase());
  });

  allCourses.forEach((courseElem) => {
    coursesContainer.append(courseElem);
  });

  const headerList = document.querySelectorAll('.course-prefix-container');

  if (headerList.length > 1) {
    headerList.forEach(e => e.remove());
  }
}

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
.share-course-div {
  display: flex;
  justify-content: center;
  border-radius: 5px;
  padding: 1px;
  margin-top: 10px;
  background-color: #8E1515;
  color: #FFFFFF !important;
  font-family: monospace;
  cursor: pointer;
}
.share-course-div:active {
  transform: scale(0.93);

}
.share-course-link:hover,
.share-course-link:active {
  text-decoration: none;
}
.linkified-course:hover {
  text-decoration: underline;
}

/* fancy tooltip stolen from https://stackoverflow.com/a/25813336, god bless him */
[data-tooltip]:before {
  /* needed - do not touch */
  content: attr(data-tooltip);
  position: absolute;
  opacity: 0;

  /* customizable */
  padding: 7px;
  color: white;
  border-radius: 5px;
  width: 110px;
  z-index: 10;
}

[data-tooltip]:hover:before {
  /* needed - do not touch */
  opacity: 1;

  /* customizable */
  background: black;
  margin-top: -40px;
  margin-left: 10px;
}

[data-tooltip]:not([data-tooltip-persistent]):before {
  pointer-events: none;
}
`;
const styleInjectElem = document.createElement('style');
styleInjectElem.id = 'umd-rmp-style-inject';
styleInjectElem.innerHTML = styleInject;
document.head.appendChild(styleInjectElem);

main();
